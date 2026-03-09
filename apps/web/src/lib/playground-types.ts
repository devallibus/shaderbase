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

export type PlaygroundSession = {
  id: string
  vertexSource: string
  fragmentSource: string
  uniforms: UniformDefinition[]
  uniformValues: Record<string, unknown> | null
  pipeline: string
  compilationErrors: string[]
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
  vertexSource: string
  fragmentSource: string
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
  vertexSource?: string
  fragmentSource?: string
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
}

export type UpdateShaderResponse = {
  status: 'ok'
  compilationErrors: string[]
  screenshotBase64: string | null
  browserConnected: boolean
}

export type ScreenshotRequest = {
  base64: string
}

export type ErrorsResponse = {
  errors: string[]
}
