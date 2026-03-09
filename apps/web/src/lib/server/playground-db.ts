import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  PlaygroundSession,
  PlaygroundError,
  UniformDefinition,
  SessionMetadata,
  CreateSessionRequest,
  PlaygroundSSEEvent,
} from '../playground-types.ts'

// ---------------------------------------------------------------------------
// Default shaders — shown when a session is created without explicit GLSL
// ---------------------------------------------------------------------------

const DEFAULT_VERTEX = `varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const DEFAULT_FRAGMENT = `uniform float uTime;
varying vec2 vUv;

void main() {
  vec3 color = 0.5 + 0.5 * cos(uTime + vUv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(color, 1.0);
}`

const DEFAULT_UNIFORMS: UniformDefinition[] = [
  { name: 'uTime', type: 'float', defaultValue: 0, description: 'Elapsed time in seconds' },
]

function validateCreateSessionRequest(opts?: CreateSessionRequest) {
  const language = opts?.language ?? 'glsl'

  if (language === 'glsl') {
    if ('tslSource' in (opts ?? {}) && opts?.tslSource !== undefined) {
      throw new Error('GLSL sessions do not accept tslSource')
    }
    return
  }

  if ('vertexSource' in (opts ?? {}) && opts?.vertexSource !== undefined) {
    throw new Error('TSL sessions do not accept vertexSource')
  }

  if ('fragmentSource' in (opts ?? {}) && opts?.fragmentSource !== undefined) {
    throw new Error('TSL sessions do not accept fragmentSource')
  }

  if (opts?.pipeline === 'postprocessing') {
    throw new Error('TSL sessions do not support the postprocessing pipeline')
  }
}

function validateUpdateShaderRequest(
  update: { vertexSource?: string; fragmentSource?: string; tslSource?: string },
  sessionLanguage: 'glsl' | 'tsl',
) {
  if (sessionLanguage === 'glsl' && update.tslSource !== undefined) {
    throw new Error('GLSL sessions do not accept tslSource updates')
  }

  if (sessionLanguage === 'tsl') {
    if (update.vertexSource !== undefined) {
      throw new Error('TSL sessions do not accept vertexSource updates')
    }

    if (update.fragmentSource !== undefined) {
      throw new Error('TSL sessions do not accept fragmentSource updates')
    }
  }
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), '.data')
const dbPath = resolve(dataDir, 'playground.sqlite')
mkdirSync(dirname(dbPath), { recursive: true })

const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS playground_sessions (
    id TEXT PRIMARY KEY,
    vertex_source TEXT NOT NULL,
    fragment_source TEXT NOT NULL,
    uniforms_json TEXT NOT NULL,
    uniform_values_json TEXT,
    pipeline TEXT NOT NULL DEFAULT 'surface',
    compilation_errors_json TEXT,
    screenshot_base64 TEXT,
    screenshot_at TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

// Schema migration: add TSL columns
try {
  db.exec(`ALTER TABLE playground_sessions ADD COLUMN shader_language TEXT NOT NULL DEFAULT 'glsl'`)
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE playground_sessions ADD COLUMN tsl_source TEXT`)
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE playground_sessions ADD COLUMN structured_errors_json TEXT`)
} catch {
  // Column already exists
}

// ---------------------------------------------------------------------------
// SSE connection registry (in-memory, ephemeral)
// ---------------------------------------------------------------------------

const sseConnections = new Map<string, Set<WritableStreamDefaultWriter<Uint8Array>>>()

// Screenshot wait queue: when an update is posted, the API waits for the
// browser to send a screenshot back. This map stores resolve callbacks.
const screenshotWaiters = new Map<string, Array<(base64: string | null) => void>>()

export function addSSEConnection(sessionId: string, writer: WritableStreamDefaultWriter<Uint8Array>) {
  let set = sseConnections.get(sessionId)
  if (!set) {
    set = new Set()
    sseConnections.set(sessionId, set)
  }
  set.add(writer)
}

export function removeSSEConnection(sessionId: string, writer: WritableStreamDefaultWriter<Uint8Array>) {
  const set = sseConnections.get(sessionId)
  if (!set) return
  set.delete(writer)
  if (set.size === 0) sseConnections.delete(sessionId)
}

export function hasSSEConnections(sessionId: string): boolean {
  const set = sseConnections.get(sessionId)
  return !!set && set.size > 0
}

export function pushSSEEvent(sessionId: string, event: PlaygroundSSEEvent) {
  const set = sseConnections.get(sessionId)
  if (!set) return
  const eventType = event.type
  const data = JSON.stringify(event)
  const encoded = new TextEncoder().encode(`event: ${eventType}\ndata: ${data}\n\n`)
  for (const writer of set) {
    writer.write(encoded).catch(() => {
      // Connection closed — will be cleaned up by removeSSEConnection
    })
  }
}

// ---------------------------------------------------------------------------
// Screenshot wait helpers
// ---------------------------------------------------------------------------

export function waitForScreenshot(sessionId: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const list = screenshotWaiters.get(sessionId) ?? []
    list.push(resolve)
    screenshotWaiters.set(sessionId, list)
    setTimeout(() => {
      // Remove this callback if it hasn't been called yet
      const current = screenshotWaiters.get(sessionId)
      if (current) {
        const idx = current.indexOf(resolve)
        if (idx !== -1) {
          current.splice(idx, 1)
          if (current.length === 0) screenshotWaiters.delete(sessionId)
        }
      }
      resolve(null)
    }, timeoutMs)
  })
}

export function resolveScreenshotWaiters(sessionId: string, base64: string) {
  const list = screenshotWaiters.get(sessionId)
  if (!list || list.length === 0) return
  screenshotWaiters.delete(sessionId)
  for (const resolve of list) {
    resolve(base64)
  }
}

// ---------------------------------------------------------------------------
// Row type from SQLite
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string
  shader_language: string
  vertex_source: string
  fragment_source: string
  tsl_source: string | null
  uniforms_json: string
  uniform_values_json: string | null
  pipeline: string
  compilation_errors_json: string | null
  structured_errors_json: string | null
  screenshot_base64: string | null
  screenshot_at: string | null
  metadata_json: string | null
  created_at: string
  updated_at: string
}

function rowToSession(row: SessionRow): PlaygroundSession {
  const base = {
    id: row.id,
    uniforms: JSON.parse(row.uniforms_json) as UniformDefinition[],
    uniformValues: row.uniform_values_json ? (JSON.parse(row.uniform_values_json) as Record<string, unknown>) : null,
    pipeline: row.pipeline,
    compilationErrors: row.compilation_errors_json
      ? (JSON.parse(row.compilation_errors_json) as string[])
      : [],
    structuredErrors: row.structured_errors_json
      ? (JSON.parse(row.structured_errors_json) as PlaygroundError[])
      : [],
    screenshotBase64: row.screenshot_base64,
    screenshotAt: row.screenshot_at,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as SessionMetadata) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.shader_language === 'tsl') {
    return { ...base, language: 'tsl', tslSource: row.tsl_source ?? '' }
  }
  return { ...base, language: 'glsl', vertexSource: row.vertex_source, fragmentSource: row.fragment_source }
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export function createSession(opts?: CreateSessionRequest): { id: string; session: PlaygroundSession } {
  validateCreateSessionRequest(opts)

  const id = randomUUID()
  const language = opts?.language ?? 'glsl'
  const uniforms = opts?.uniforms ?? DEFAULT_UNIFORMS
  const pipeline = opts?.pipeline ?? 'surface'

  // Language-specific source defaults — TSL sessions don't carry GLSL payloads
  const vertexSource = language === 'glsl'
    ? ((opts as { vertexSource?: string })?.vertexSource ?? DEFAULT_VERTEX)
    : ''
  const fragmentSource = language === 'glsl'
    ? ((opts as { fragmentSource?: string })?.fragmentSource ?? DEFAULT_FRAGMENT)
    : ''
  const tslSource = language === 'tsl'
    ? ((opts as { tslSource?: string })?.tslSource ?? null)
    : null

  db.prepare(
    `INSERT INTO playground_sessions (id, shader_language, vertex_source, fragment_source, tsl_source, uniforms_json, pipeline)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, language, vertexSource, fragmentSource, tslSource, JSON.stringify(uniforms), pipeline)

  const session = getSession(id)!
  return { id, session }
}

export function getSession(id: string): PlaygroundSession | null {
  const row = db
    .prepare(`SELECT * FROM playground_sessions WHERE id = ?`)
    .get(id) as SessionRow | undefined
  if (!row) return null
  return rowToSession(row)
}

export function updateShader(
  id: string,
  update: { vertexSource?: string; fragmentSource?: string; tslSource?: string },
  sessionLanguage: 'glsl' | 'tsl',
): void {
  validateUpdateShaderRequest(update, sessionLanguage)

  const parts: string[] = []
  const values: unknown[] = []

  if (sessionLanguage === 'glsl') {
    if (update.vertexSource !== undefined) {
      parts.push('vertex_source = ?')
      values.push(update.vertexSource)
    }
    if (update.fragmentSource !== undefined) {
      parts.push('fragment_source = ?')
      values.push(update.fragmentSource)
    }
  } else {
    if (update.tslSource !== undefined) {
      parts.push('tsl_source = ?')
      values.push(update.tslSource)
    }
  }

  if (parts.length === 0) return

  parts.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE playground_sessions SET ${parts.join(', ')} WHERE id = ?`).run(...values)

  // Push SSE update to connected browsers
  const session = getSession(id)
  if (session) {
    const event: PlaygroundSSEEvent = session.language === 'tsl'
      ? { type: 'shader_update', language: 'tsl', tslSource: session.tslSource }
      : { type: 'shader_update', language: 'glsl', vertexSource: session.vertexSource, fragmentSource: session.fragmentSource }
    pushSSEEvent(id, event)
  }
}

export function setScreenshot(id: string, base64: string): void {
  db.prepare(
    `UPDATE playground_sessions SET screenshot_base64 = ?, screenshot_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
  ).run(base64, id)

  // Resolve any waiters
  resolveScreenshotWaiters(id, base64)
}

export function setErrors(id: string, errors: string[]): void {
  db.prepare(
    `UPDATE playground_sessions SET compilation_errors_json = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(errors), id)
}

export function setStructuredErrors(id: string, errors: PlaygroundError[]): void {
  db.prepare(
    `UPDATE playground_sessions SET structured_errors_json = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(errors), id)
}

export function setUniformValues(id: string, values: Record<string, unknown>): void {
  db.prepare(
    `UPDATE playground_sessions SET uniform_values_json = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(values), id)
}

export function updateMetadata(id: string, metadata: SessionMetadata): void {
  db.prepare(
    `UPDATE playground_sessions SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(metadata), id)
}
