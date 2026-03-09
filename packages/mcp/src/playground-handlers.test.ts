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
        body: {
          sessionId: "abc-123",
          url: "https://test.shaderbase.com/playground?session=abc-123",
          previewAvailable: true,
        },
      },
    });

    const result = await handleCreatePlayground({}, env, mockFetch);
    assert.equal(result.sessionId, "abc-123");
    assert.ok(result.url.includes("abc-123"));
    assert.equal(result.previewAvailable, true);
  });

  await runTest("create_playground returns previewAvailable flag", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/create": {
        status: 200,
        body: { sessionId: "glsl-1", url: "https://test.shaderbase.com/playground?session=glsl-1", previewAvailable: true },
      },
    });

    const result = await handleCreatePlayground({}, env, mockFetch);
    assert.equal(result.previewAvailable, true);
  });

  await runTest("create_playground TSL session returns previewAvailable false", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/create": {
        status: 200,
        body: { sessionId: "tsl-1", url: "https://test.shaderbase.com/playground?session=tsl-1", previewAvailable: false },
      },
    });

    const result = await handleCreatePlayground({ language: "tsl", tslSource: "// tsl" }, env, mockFetch);
    assert.equal(result.previewAvailable, false);
  });

  await runTest("create_playground forwards custom GLSL", async () => {
    let capturedBody: string | undefined;
    const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({
        sessionId: "xyz",
        url: "http://test/playground?session=xyz",
        previewAvailable: true,
      }), {
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
          structuredErrors: [],
          screenshotBase64: "data:image/png;base64,abc",
          browserConnected: true,
          previewAvailable: true,
        },
      },
    });

    const result = await handleUpdateShader(
      { sessionId: "sess-1", fragmentSource: "new code" },
      env,
      mockFetch,
    );
    assert.deepEqual(result.compilationErrors, []);
    assert.deepEqual(result.structuredErrors, []);
    assert.equal(result.screenshotBase64, "data:image/png;base64,abc");
    assert.equal(result.browserConnected, true);
    assert.equal(result.previewAvailable, true);
  });

  await runTest("update_shader returns structured errors and previewAvailable", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/tsl-sess/update": {
        status: 200,
        body: {
          compilationErrors: [],
          structuredErrors: [{ kind: "tsl-parse", message: "Unexpected token at line 3" }],
          screenshotBase64: null,
          browserConnected: false,
          previewAvailable: false,
        },
      },
    });

    const result = await handleUpdateShader(
      { sessionId: "tsl-sess", tslSource: "bad code" },
      env,
      mockFetch,
    );
    assert.equal(result.structuredErrors.length, 1);
    assert.equal(result.structuredErrors[0]!.kind, "tsl-parse");
    assert.equal(result.previewAvailable, false);
    assert.equal(result.screenshotBase64, null);
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

  await runTest("get_preview returns screenshot and language", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-2/state": {
        status: 200,
        body: { screenshotBase64: "data:image/png;base64,screenshot", language: "glsl" },
      },
    });

    const result = await handleGetPreview({ sessionId: "sess-2" }, env, mockFetch);
    assert.equal(result.screenshotBase64, "data:image/png;base64,screenshot");
    assert.equal(result.language, "glsl");
  });

  await runTest("get_preview returns null screenshot for GLSL session", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-3/state": {
        status: 200,
        body: { screenshotBase64: null, language: "glsl" },
      },
    });

    const result = await handleGetPreview({ sessionId: "sess-3" }, env, mockFetch);
    assert.equal(result.screenshotBase64, null);
    assert.equal(result.language, "glsl");
  });

  await runTest("get_preview returns language tsl for TSL sessions", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/tsl-prev/state": {
        status: 200,
        body: { screenshotBase64: null, language: "tsl" },
      },
    });

    const result = await handleGetPreview({ sessionId: "tsl-prev" }, env, mockFetch);
    assert.equal(result.screenshotBase64, null);
    assert.equal(result.language, "tsl");
  });

  await runTest("get_errors returns error list with structured errors", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-4/errors": {
        status: 200,
        body: {
          errors: ["ERROR: 0:5: undeclared identifier"],
          structuredErrors: [{ kind: "glsl-compile", message: "ERROR: 0:5: undeclared identifier" }],
        },
      },
    });

    const result = await handleGetErrors({ sessionId: "sess-4" }, env, mockFetch);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0]!.includes("undeclared"));
    assert.equal(result.structuredErrors.length, 1);
    assert.equal(result.structuredErrors[0]!.kind, "glsl-compile");
  });

  await runTest("get_errors returns empty arrays when no errors", async () => {
    const mockFetch = createMockFetch({
      "/api/playground/sess-5/errors": {
        status: 200,
        body: { errors: [], structuredErrors: [] },
      },
    });

    const result = await handleGetErrors({ sessionId: "sess-5" }, env, mockFetch);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.structuredErrors, []);
  });

  console.log("playground-handlers tests passed");
}

main();
