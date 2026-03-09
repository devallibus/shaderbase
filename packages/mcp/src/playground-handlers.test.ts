import assert from "node:assert/strict";
import {
  handleCreatePlayground,
  handleUpdateShader,
  handleGetPreview,
  handleGetErrors,
} from "./playground-handlers.ts";

function runTest(name: string, callback: () => void | Promise<void>) {
  const result = callback();
  if (result instanceof Promise) {
    result.then(
      () => console.log(`ok ${name}`),
      (error) => {
        console.error(`not ok ${name}`);
        throw error;
      },
    );
    return result;
  }
  console.log(`ok ${name}`);
}

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const env = {
  webAppUrl: "https://test.shaderbase.com",
  playgroundSecret: "test-secret",
};

function createMockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    for (const [pattern, resp] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        // Verify auth header is present
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.Authorization) {
          assert.equal(headers.Authorization, "Bearer test-secret");
        }
        return new Response(JSON.stringify(resp.body), {
          status: resp.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not found", { status: 404 });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  await runTest("create_playground sends POST and returns session", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/create": {
        status: 200,
        body: { sessionId: "abc-123", url: "https://test.shaderbase.com/playground?session=abc-123" },
      },
    });

    const result = await handleCreatePlayground({}, env, mockFetch);
    assert.equal(result.sessionId, "abc-123");
    assert.ok(result.url.includes("abc-123"));
  });

  await runTest("create_playground forwards custom GLSL", async () => {
    let capturedBody: string | undefined;
    const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ sessionId: "xyz", url: "http://test/playground?session=xyz" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await handleCreatePlayground(
      { vertexSource: "v1", fragmentSource: "f1", pipeline: "geometry" },
      env,
      mockFetch,
    );

    const parsed = JSON.parse(capturedBody!);
    assert.equal(parsed.vertexSource, "v1");
    assert.equal(parsed.fragmentSource, "f1");
    assert.equal(parsed.pipeline, "geometry");
  });

  await runTest("update_shader sends POST with sessionId and returns result", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-1/update": {
        status: 200,
        body: {
          compilationErrors: [],
          screenshotBase64: "data:image/png;base64,abc",
          browserConnected: true,
        },
      },
    });

    const result = await handleUpdateShader(
      { sessionId: "sess-1", fragmentSource: "new code" },
      env,
      mockFetch,
    );
    assert.deepEqual(result.compilationErrors, []);
    assert.equal(result.screenshotBase64, "data:image/png;base64,abc");
    assert.equal(result.browserConnected, true);
  });

  await runTest("update_shader throws on failure", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/bad-id/update": {
        status: 404,
        body: { error: "Session not found" },
      },
    });

    await assert.rejects(
      () => handleUpdateShader({ sessionId: "bad-id" }, env, mockFetch),
      /Failed to update shader: 404/,
    );
  });

  await runTest("get_preview returns screenshot", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-2/state": {
        status: 200,
        body: { screenshotBase64: "data:image/png;base64,screenshot" },
      },
    });

    const result = await handleGetPreview({ sessionId: "sess-2" }, env, mockFetch);
    assert.equal(result.screenshotBase64, "data:image/png;base64,screenshot");
  });

  await runTest("get_preview returns null when no screenshot", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-3/state": {
        status: 200,
        body: { screenshotBase64: null },
      },
    });

    const result = await handleGetPreview({ sessionId: "sess-3" }, env, mockFetch);
    assert.equal(result.screenshotBase64, null);
  });

  await runTest("get_errors returns error list", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-4/errors": {
        status: 200,
        body: { errors: ["ERROR: 0:5: undeclared identifier"] },
      },
    });

    const result = await handleGetErrors({ sessionId: "sess-4" }, env, mockFetch);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0]!.includes("undeclared"));
  });

  await runTest("get_errors returns empty array when no errors", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-5/errors": {
        status: 200,
        body: { errors: [] },
      },
    });

    const result = await handleGetErrors({ sessionId: "sess-5" }, env, mockFetch);
    assert.deepEqual(result.errors, []);
  });

  console.log("playground-handlers tests passed");
}

main();
