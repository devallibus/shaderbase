# Shader Playground — Design Spec

**Issue:** #52
**Phase:** B (v0.3 milestone)
**Status:** Draft

## Overview

An agent-first shader editor where AI agents write GLSL via MCP tools and get visual feedback (screenshots), while humans see a live preview + code editor side-by-side.

No built-in chat panel — agents connect externally via MCP.

## Architecture

```
  Agent (Claude, etc.)
       │
       ▼
  MCP Worker (Cloudflare)
       │  POST /api/playground/create
       │  POST /api/playground/:id/update
       │  GET  /api/playground/:id/state
       │  GET  /api/playground/:id/errors
       ▼
  Web App (Railway)
       │
       ├── SQLite (playground.sqlite)
       │   └── playground_sessions table
       │
       └── In-memory SSE registry
            │  GET /api/playground/:id/events
            ▼
        Browser (SolidJS)
            ├── CodeMirror 6 editor
            ├── Three.js WebGL canvas
            └── POST /api/playground/:id/screenshot
```

## Session Data Model

```typescript
type PlaygroundSession = {
  id: string                    // UUID
  vertexSource: string          // GLSL vertex shader
  fragmentSource: string        // GLSL fragment shader
  uniforms: UniformDefinition[] // Uniform definitions
  uniformValues: Record<string, unknown> | null // Current values
  pipeline: string              // "surface" | "postprocessing" | "geometry"
  compilationErrors: string[]   // Error strings from WebGL
  screenshotBase64: string | null // Latest PNG screenshot
  screenshotAt: string | null   // ISO timestamp
  metadata: SessionMetadata | null // name, summary, tags for submit
  createdAt: string
  updatedAt: string
}

type UniformDefinition = {
  name: string
  type: string
  defaultValue: unknown
  description?: string
  min?: number
  max?: number
}

type SessionMetadata = {
  name?: string
  displayName?: string
  summary?: string
  tags?: string[]
}
```

## API Route Contracts

All write routes require `Authorization: Bearer <PLAYGROUND_SECRET>` header.

### POST /api/playground/create

Create a new playground session.

**Request:**
```json
{
  "vertexSource?": "...",
  "fragmentSource?": "...",
  "uniforms?": [...],
  "pipeline?": "surface"
}
```

**Response (201):**
```json
{
  "sessionId": "uuid",
  "url": "https://shaderbase.com/playground?session=uuid"
}
```

### POST /api/playground/:sessionId/update

Update GLSL source. Pushes changes to connected browsers via SSE. Waits up to 5 seconds for a screenshot from the browser.

**Request:**
```json
{
  "vertexSource?": "...",
  "fragmentSource?": "..."
}
```

**Response (200):**
```json
{
  "status": "ok",
  "compilationErrors": [],
  "screenshotBase64": "data:image/png;base64,...",
  "browserConnected": true
}
```

### GET /api/playground/:sessionId/state

Returns current session state. Used by browser on initial load / reconnect.

**Response (200):** Full `PlaygroundSession` object.

### POST /api/playground/:sessionId/screenshot

Browser uploads screenshot after successful render.

**Request:**
```json
{
  "base64": "data:image/png;base64,..."
}
```

**Response (200):** `{ "status": "ok" }`

### GET /api/playground/:sessionId/events

SSE stream pushing GLSL updates to the browser.

**Events:**
```
event: shader_update
data: {"vertexSource":"...","fragmentSource":"..."}

event: uniform_update
data: {"values":{...}}
```

### GET /api/playground/:sessionId/errors

Returns current compilation errors from DB.

**Response (200):**
```json
{
  "errors": ["ERROR: 0:5: 'foo' : undeclared identifier"]
}
```

## MCP Tool Definitions

### create_playground

Create a new playground session for live GLSL editing.

**Input:** `{ vertexSource?, fragmentSource?, uniforms?, pipeline? }`
**Output:** `{ sessionId, url }` as text content.

### update_shader

Update GLSL source in a playground session. Returns compilation errors and a screenshot.

**Input:** `{ sessionId, vertexSource?, fragmentSource? }`
**Output:** Text content with errors + image content with screenshot PNG.

### get_preview

Get the latest screenshot from a playground session.

**Input:** `{ sessionId }`
**Output:** Image content with screenshot PNG, or text if no screenshot available.

### get_errors

Get compilation errors from a playground session.

**Input:** `{ sessionId }`
**Output:** Text content with error list.

## Screenshot Flow

1. Agent calls `update_shader` via MCP
2. MCP Worker POSTs to web app `/api/playground/:id/update`
3. Web app stores new GLSL in DB, pushes SSE event to connected browsers
4. Browser receives SSE, recompiles shader in WebGL canvas
5. On success: browser captures `canvas.toDataURL("image/png")`, POSTs to `/api/playground/:id/screenshot`
6. Web app stores screenshot in DB, resolves the waiting `/update` response with screenshot
7. MCP Worker returns screenshot as `{ type: "image", data: base64, mimeType: "image/png" }` content

## UI Wireframe

```
+------------------------------------------------------+
| shaderbase  shaders  about  playground               |
+------------------------------------------------------+
|                          |                            |
|  [Fragment] [Vertex]     |   +--------------------+  |
|  +--------------------+  |   |                    |  |
|  |                    |  |   |   WebGL Canvas     |  |
|  |   CodeMirror 6     |  |   |   (live preview)   |  |
|  |   GLSL Editor      |  |   |                    |  |
|  |                    |  |   +--------------------+  |
|  |                    |  |                            |
|  |                    |  |   Uniforms                 |
|  |                    |  |   +---------+----------+   |
|  |                    |  |   | uTime   | 0.00     |   |
|  |                    |  |   | uColor  | [===]    |   |
|  +--------------------+  |   +---------+----------+   |
|                          |                            |
|  Errors: None            |                            |
+------------------------------------------------------+
```

## Future Phases

- **Chat panel:** Embedded agent chat (would require auth + rate limiting)
- **submit_to_registry:** MCP tool to create PR from playground session
- **Uniform MCP tools:** `set_uniform`, `add_uniform` for fine-grained control
- **Persistence:** User accounts, saved playground history
- **Collaboration:** Multiple agents/users editing same session
- **Shader graph:** Visual node-based shader composition
