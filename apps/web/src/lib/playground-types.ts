// ---------------------------------------------------------------------------
// Playground shared types — used by server (DB, API) and client (UI, SSE)
// ---------------------------------------------------------------------------

export type UniformDefinition = {
  name: string
  type: string
  defaultValue: unknown
  description?: string
  min?: number
  max?: number
}

export type SessionMetadata = {
  name?: string
  displayName?: string
  summary?: string
  tags?: string[]
}

// ---------------------------------------------------------------------------
// Structured errors
// ---------------------------------------------------------------------------

export type PlaygroundError =
  | { kind: 'glsl-compile'; message: string }
  | { kind: 'glsl-link'; message: string }
  | { kind: 'tsl-parse'; message: string }
  | { kind: 'tsl-runtime'; message: string }
  | { kind: 'tsl-material-build'; message: string }

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export type PlaygroundSession = {
  id: string
  language: 'glsl' | 'tsl'
  vertexSource: string
  fragmentSource: string
  tslSource: string | null
  uniforms: UniformDefinition[]
  uniformValues: Record<string, unknown> | null
  pipeline: string
  compilationErrors: string[]
  structuredErrors: PlaygroundError[]
  screenshotBase64: string | null
  screenshotAt: string | null
  metadata: SessionMetadata | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

export type ShaderUpdateEvent = {
  type: 'shader_update'
  language: 'glsl' | 'tsl'
  vertexSource: string
  fragmentSource: string
  tslSource: string | null
}

export type UniformUpdateEvent = {
  type: 'uniform_update'
  values: Record<string, unknown>
}

export type PlaygroundSSEEvent = ShaderUpdateEvent | UniformUpdateEvent

// ---------------------------------------------------------------------------
// API request / response types
// ---------------------------------------------------------------------------

export type CreateSessionRequest = {
  language?: 'glsl' | 'tsl'
  vertexSource?: string
  fragmentSource?: string
  tslSource?: string
  uniforms?: UniformDefinition[]
  pipeline?: string
}

export type CreateSessionResponse = {
  sessionId: string
  url: string
}

export type UpdateShaderRequest = {
  vertexSource?: string
  fragmentSource?: string
  tslSource?: string
}

export type UpdateShaderResponse = {
  status: 'ok'
  compilationErrors: string[]
  structuredErrors: PlaygroundError[]
  screenshotBase64: string | null
  browserConnected: boolean
}

export type ScreenshotRequest = {
  base64: string
}

export type ErrorsResponse = {
  errors: string[]
  structuredErrors: PlaygroundError[]
}
