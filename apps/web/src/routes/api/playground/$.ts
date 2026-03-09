import { createFileRoute } from '@tanstack/solid-router'
import {
  createSession,
  getSession,
  updateShader,
  setScreenshot,
  setErrors,
  hasSSEConnections,
  addSSEConnection,
  removeSSEConnection,
  waitForScreenshot,
} from '../../../lib/server/playground-db'
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  UpdateShaderRequest,
  UpdateShaderResponse,
  ScreenshotRequest,
  ErrorsResponse,
} from '../../../lib/playground-types'

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

const PLAYGROUND_SECRET = process.env.PLAYGROUND_SECRET || ''

function isAuthorized(request: Request): boolean {
  if (!PLAYGROUND_SECRET) return true // No secret configured = open (dev mode)
  const auth = request.headers.get('Authorization')
  return auth === `Bearer ${PLAYGROUND_SECRET}`
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

// ---------------------------------------------------------------------------
// Main playground API handler
// ---------------------------------------------------------------------------

const WEB_URL = process.env.WEB_URL || 'https://shaderbase.com'
const SCREENSHOT_WAIT_MS = 5000

async function handlePlayground(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // Remove "/api/playground/" prefix and parse the rest
  const pathAfter = url.pathname.replace(/^\/api\/playground\/?/, '')
  const segments = pathAfter.split('/').filter(Boolean)

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  // POST /api/playground/create
  // No auth required — creating an empty session is harmless.
  // The session UUID acts as the capability token.
  if (segments[0] === 'create' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as CreateSessionRequest
    const { id } = createSession(body)
    const response: CreateSessionResponse = {
      sessionId: id,
      url: `${WEB_URL}/playground?session=${id}`,
    }
    return jsonResponse(response, 201)
  }

  // Routes that require a sessionId: /api/playground/:sessionId/:action
  const sessionId = segments[0]
  const action = segments[1]
  if (!sessionId) {
    return jsonResponse({ error: 'Missing session ID' }, 400)
  }

  // GET /api/playground/:sessionId/state
  if (action === 'state' && request.method === 'GET') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)
    return jsonResponse(session)
  }

  // GET /api/playground/:sessionId/errors
  if (action === 'errors' && request.method === 'GET') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)
    const response: ErrorsResponse = { errors: session.compilationErrors }
    return jsonResponse(response)
  }

  // GET /api/playground/:sessionId/events (SSE)
  if (action === 'events' && request.method === 'GET') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)

    const stream = new TransformStream<Uint8Array, Uint8Array>()
    const writer = stream.writable.getWriter()
    addSSEConnection(sessionId, writer)

    // Send initial keepalive
    const encoder = new TextEncoder()
    writer.write(encoder.encode(': connected\n\n')).catch(() => {})

    // Clean up when client disconnects
    request.signal?.addEventListener('abort', () => {
      removeSSEConnection(sessionId, writer)
      writer.close().catch(() => {})
    })

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // POST /api/playground/:sessionId/update
  // No auth required — the session UUID is the capability token.
  // Both the browser editor and the MCP worker can update.
  if (action === 'update' && request.method === 'POST') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)

    const body = (await request.json().catch(() => ({}))) as UpdateShaderRequest
    updateShader(sessionId, body)

    // Wait for screenshot from browser (with timeout)
    const browserConnected = hasSSEConnections(sessionId)
    let screenshotBase64: string | null = null
    if (browserConnected) {
      screenshotBase64 = await waitForScreenshot(sessionId, SCREENSHOT_WAIT_MS)
    }

    // Re-fetch session to get latest errors
    const updated = getSession(sessionId)
    const response: UpdateShaderResponse = {
      status: 'ok',
      compilationErrors: updated?.compilationErrors ?? [],
      screenshotBase64,
      browserConnected,
    }
    return jsonResponse(response)
  }

  // POST /api/playground/:sessionId/screenshot
  if (action === 'screenshot' && request.method === 'POST') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)

    const body = (await request.json().catch(() => ({}))) as ScreenshotRequest
    if (!body.base64) return jsonResponse({ error: 'Missing base64 field' }, 400)
    setScreenshot(sessionId, body.base64)
    return jsonResponse({ status: 'ok' })
  }

  // POST /api/playground/:sessionId/errors
  if (action === 'errors' && request.method === 'POST') {
    const session = getSession(sessionId)
    if (!session) return jsonResponse({ error: 'Session not found' }, 404)

    const body = (await request.json().catch(() => ({ errors: [] }))) as { errors: string[] }
    setErrors(sessionId, body.errors ?? [])
    return jsonResponse({ status: 'ok' })
  }

  return jsonResponse({ error: 'Not found' }, 404)
}

// ---------------------------------------------------------------------------
// TanStack Start route — catch-all for /api/playground/*
// ---------------------------------------------------------------------------

const handlers = {
  GET: async ({ request }: { request: Request }) => handlePlayground(request),
  POST: async ({ request }: { request: Request }) => handlePlayground(request),
  OPTIONS: async ({ request }: { request: Request }) => handlePlayground(request),
}

export const Route = createFileRoute('/api/playground/$')({
  server: {
    handlers,
  },
})
