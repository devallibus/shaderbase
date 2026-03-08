import assert from "node:assert/strict";

// Import the Worker default export
import worker from "./index.ts";

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
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://shaderbase-mcp.test.workers.dev";

const env = {
  // Use a dummy URL; the MCP protocol tests only exercise initialize/tools/list
  // and don't actually hit the registry (except tools/call, which we test below)
  REGISTRY_URL: "https://mock-registry.test",
};

function mcpRequest(body: Record<string, unknown>): Request {
  return new Request(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fetchMcp(body: Record<string, unknown>): Promise<Response> {
  return worker.fetch(mcpRequest(body), env);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  // --- Protocol basics ---

  await runTest("POST /mcp initialize returns server info", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.jsonrpc, "2.0");
    assert.equal(data.id, 1);
    const result = data.result as Record<string, unknown>;
    assert.equal(result.protocolVersion, "2025-03-26");
    const serverInfo = result.serverInfo as Record<string, string>;
    assert.equal(serverInfo.name, "shaderbase");
    assert.equal(serverInfo.version, "0.1.0");
    const capabilities = result.capabilities as Record<string, unknown>;
    assert.ok("tools" in capabilities);
  });

  await runTest("POST /mcp notifications/initialized returns 204", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.equal(res.status, 204);
  });

  await runTest("POST /mcp tools/list returns tool definitions", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.id, 2);
    const result = data.result as { tools: Array<{ name: string }> };
    assert.equal(result.tools.length, 2);

    const names = result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["get_shader", "search_shaders"]);

    // Verify inputSchema is present on each tool
    for (const tool of result.tools) {
      const t = tool as unknown as { inputSchema: { type: string } };
      assert.equal(t.inputSchema.type, "object");
    }
  });

  await runTest("POST /mcp ping returns empty result", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 3,
      method: "ping",
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.id, 3);
    assert.deepEqual(data.result, {});
  });

  // --- Error handling ---

  await runTest("POST /mcp unknown method returns -32601", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/list",
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.id, 4);
    const err = data.error as { code: number; message: string };
    assert.equal(err.code, -32601);
    assert.ok(err.message.includes("resources/list"));
  });

  await runTest("POST /mcp invalid JSON returns parse error", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{{{",
      }),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    const err = data.error as { code: number };
    assert.equal(err.code, -32700);
  });

  await runTest("POST /mcp invalid jsonrpc version returns -32600", async () => {
    const res = await fetchMcp({
      jsonrpc: "1.0" as "2.0",
      id: 5,
      method: "initialize",
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    const err = data.error as { code: number };
    assert.equal(err.code, -32600);
  });

  await runTest("POST /mcp tools/call with missing name returns error", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { arguments: {} },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    const err = data.error as { code: number; message: string };
    assert.equal(err.code, -32602);
    assert.ok(err.message.includes("missing tool name"));
  });

  await runTest("POST /mcp tools/call with unknown tool returns error", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "nonexistent_tool", arguments: {} },
    });
    assert.equal(res.status, 200);
    const data = await res.json() as Record<string, unknown>;
    const err = data.error as { code: number; message: string };
    assert.equal(err.code, -32601);
    assert.ok(err.message.includes("nonexistent_tool"));
  });

  // --- HTTP method handling ---

  await runTest("GET /mcp returns 405", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/mcp`, { method: "GET" }),
      env,
    );
    assert.equal(res.status, 405);
  });

  await runTest("DELETE /mcp returns 405", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/mcp`, { method: "DELETE" }),
      env,
    );
    assert.equal(res.status, 405);
  });

  // --- CORS ---

  await runTest("OPTIONS /mcp returns CORS headers", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/mcp`, { method: "OPTIONS" }),
      env,
    );
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("Access-Control-Allow-Origin"));
    assert.ok(res.headers.get("Access-Control-Allow-Methods")?.includes("POST"));
    assert.ok(res.headers.get("Access-Control-Allow-Headers")?.includes("Mcp-Session-Id"));
  });

  await runTest("POST /mcp responses include CORS headers", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      id: 10,
      method: "ping",
    });
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  // --- Unknown notification (no id) returns 204 ---

  await runTest("POST /mcp unknown notification (no id) returns 204", async () => {
    const res = await fetchMcp({
      jsonrpc: "2.0",
      method: "notifications/some_unknown",
    });
    assert.equal(res.status, 204);
  });

  // --- Legacy endpoints still work ---

  await runTest("GET /health still works", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/health`),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json() as { status: string };
    assert.equal(data.status, "ok");
  });

  await runTest("GET /tools still works", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/tools`),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json() as { tools: unknown[] };
    assert.equal(data.tools.length, 2);
  });

  await runTest("GET / returns informational response with /mcp endpoint", async () => {
    const res = await worker.fetch(
      new Request(`${BASE_URL}/`),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json() as { endpoints: Record<string, string> };
    assert.ok("/mcp" in data.endpoints);
  });

  console.log("index tests passed");
}

main();
