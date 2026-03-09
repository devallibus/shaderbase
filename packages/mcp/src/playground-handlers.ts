// ---------------------------------------------------------------------------
// Playground MCP handlers — proxy requests to the web app
// ---------------------------------------------------------------------------

type PlaygroundEnv = {
  webAppUrl: string;
  playgroundSecret: string;
};

function authHeaders(env: PlaygroundEnv): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.playgroundSecret}`,
  };
}

// ---------------------------------------------------------------------------
// create_playground
// ---------------------------------------------------------------------------

export async function handleCreatePlayground(
  args: {
    vertexSource?: string;
    fragmentSource?: string;
    tslSource?: string;
    language?: string;
    uniforms?: Array<{ name: string; type: string; defaultValue: unknown }>;
    pipeline?: string;
  },
  env: PlaygroundEnv,
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ sessionId: string; url: string }> {
  const response = await fetchFn(`${env.webAppUrl}/api/playground/create`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create playground session: ${response.status} ${body}`);
  }

  return (await response.json()) as { sessionId: string; url: string };
}

// ---------------------------------------------------------------------------
// update_shader
// ---------------------------------------------------------------------------

export async function handleUpdateShader(
  args: {
    sessionId: string;
    vertexSource?: string;
    fragmentSource?: string;
    tslSource?: string;
  },
  env: PlaygroundEnv,
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{
  compilationErrors: string[];
  screenshotBase64: string | null;
  browserConnected: boolean;
}> {
  const { sessionId, ...shaderUpdate } = args;
  const response = await fetchFn(`${env.webAppUrl}/api/playground/${sessionId}/update`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify(shaderUpdate),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to update shader: ${response.status} ${body}`);
  }

  return (await response.json()) as {
    compilationErrors: string[];
    screenshotBase64: string | null;
    browserConnected: boolean;
  };
}

// ---------------------------------------------------------------------------
// get_preview
// ---------------------------------------------------------------------------

export async function handleGetPreview(
  args: { sessionId: string },
  env: PlaygroundEnv,
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ screenshotBase64: string | null }> {
  const response = await fetchFn(`${env.webAppUrl}/api/playground/${args.sessionId}/state`, {
    method: "GET",
    headers: { Authorization: `Bearer ${env.playgroundSecret}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get preview: ${response.status} ${body}`);
  }

  const session = (await response.json()) as { screenshotBase64: string | null };
  return { screenshotBase64: session.screenshotBase64 };
}

// ---------------------------------------------------------------------------
// get_errors
// ---------------------------------------------------------------------------

export async function handleGetErrors(
  args: { sessionId: string },
  env: PlaygroundEnv,
  fetchFn: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): Promise<{ errors: string[] }> {
  const response = await fetchFn(`${env.webAppUrl}/api/playground/${args.sessionId}/errors`, {
    method: "GET",
    headers: { Authorization: `Bearer ${env.playgroundSecret}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get errors: ${response.status} ${body}`);
  }

  return (await response.json()) as { errors: string[] };
}
