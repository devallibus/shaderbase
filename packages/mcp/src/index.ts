// ---------------------------------------------------------------------------
// ShaderBase MCP Server — Cloudflare Worker
// ---------------------------------------------------------------------------

import { handleSearchShaders, handleGetShader } from "./handlers.ts";

interface Env {
  REGISTRY_URL?: string;
}

const DEFAULT_REGISTRY_URL = "https://shaderbase-registry.pages.dev";

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Tool definitions — HTTP format (used by /tools endpoint)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "search_shaders",
    description:
      "Search the ShaderBase registry for shaders by query, category, pipeline, environment, or tags.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Free-text search matched against name, displayName, summary, and tags.",
        },
        category: {
          type: "string",
          description: "Filter by category (e.g. 'color', 'post-processing', 'geometry').",
        },
        pipeline: {
          type: "string",
          description: "Filter by pipeline (e.g. 'surface', 'postprocessing', 'geometry').",
        },
        environment: {
          type: "string",
          description:
            "Filter by target environment (e.g. 'three', 'r3f', 'react-three-fiber').",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags — all specified tags must be present.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_shader",
    description:
      "Retrieve the full shader bundle including GLSL source, uniforms, and integration recipes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "The shader name (e.g. 'gradient-radial').",
        },
        environment: {
          type: "string",
          description:
            "Optionally filter recipes to a specific environment (e.g. 'three', 'r3f').",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool definitions — MCP protocol format (used by /mcp endpoint)
// ---------------------------------------------------------------------------

const TOOLS_MCP_FORMAT = [
  {
    name: "search_shaders",
    description:
      "Search the ShaderBase registry for Three.js shaders by query, category, pipeline, environment, or tags. Returns matching shaders with metadata including name, summary, tags, category, pipeline, and uniform signatures.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Free-text search against name, summary, and tags",
        },
        category: {
          type: "string",
          description: "Filter by category (e.g. 'color', 'geometry', 'post-processing')",
        },
        pipeline: {
          type: "string",
          description: "Filter by pipeline (e.g. 'surface', 'postprocessing', 'geometry')",
        },
        environment: {
          type: "string",
          description: "Filter by environment ('three' or 'r3f')",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (all must match)",
        },
      },
    },
  },
  {
    name: "get_shader",
    description:
      "Get full shader details including GLSL source code and integration recipe, ready to copy into a Three.js or React Three Fiber project. Returns vertex shader, fragment shader, uniforms, and recipe code.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Shader name in kebab-case (e.g. 'gradient-radial')",
        },
        environment: {
          type: "string",
          description: "Only return recipe for this environment ('three' or 'r3f')",
        },
      },
      required: ["name"] as const,
    },
  },
];

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
}

// ---------------------------------------------------------------------------
// MCP tool call handler
// ---------------------------------------------------------------------------

async function handleMcpToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  registryUrl: string,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (toolName === "search_shaders") {
    const results = await handleSearchShaders(
      toolArgs as {
        query?: string;
        category?: string;
        pipeline?: string;
        environment?: string;
        tags?: string[];
      },
      registryUrl,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }

  if (toolName === "get_shader") {
    if (!toolArgs.name || typeof toolArgs.name !== "string") {
      throw new Error("Missing required parameter: name");
    }
    const result = await handleGetShader(
      toolArgs as { name: string; environment?: string },
      registryUrl,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const registryUrl = env.REGISTRY_URL ?? DEFAULT_REGISTRY_URL;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // -----------------------------------------------------------------------
    // MCP Streamable HTTP transport — POST /mcp
    // -----------------------------------------------------------------------
    if (url.pathname === "/mcp" && request.method === "POST") {
      let body: JsonRpcRequest;
      try {
        body = (await request.json()) as JsonRpcRequest;
      } catch {
        return jsonRpcError(null, -32700, "Parse error: invalid JSON");
      }

      if (body.jsonrpc !== "2.0") {
        return jsonRpcError(body.id, -32600, "Invalid Request: jsonrpc must be \"2.0\"");
      }

      switch (body.method) {
        // --- initialize ---
        case "initialize":
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: {
                name: "shaderbase",
                version: "0.1.0",
              },
            },
          });

        // --- notifications/initialized ---
        case "notifications/initialized":
          return new Response(null, { status: 204, headers: CORS_HEADERS });

        // --- tools/list ---
        case "tools/list":
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: { tools: TOOLS_MCP_FORMAT },
          });

        // --- tools/call ---
        case "tools/call": {
          const toolName = body.params?.name as string | undefined;
          const toolArgs = (body.params?.arguments as Record<string, unknown>) ?? {};

          if (!toolName) {
            return jsonRpcError(body.id, -32602, "Invalid params: missing tool name");
          }

          try {
            const result = await handleMcpToolCall(toolName, toolArgs, registryUrl);
            return jsonResponse({
              jsonrpc: "2.0",
              id: body.id,
              result,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // If the tool is unknown, return method-not-found
            if (message.startsWith("Unknown tool:")) {
              return jsonRpcError(body.id, -32601, message);
            }

            // Tool execution errors: return as tool result with isError flag
            return jsonResponse({
              jsonrpc: "2.0",
              id: body.id,
              result: {
                content: [{ type: "text", text: message }],
                isError: true,
              },
            });
          }
        }

        // --- ping ---
        case "ping":
          return jsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {},
          });

        // --- unknown method ---
        default:
          // Notifications (methods without id) get 204
          if (body.id === undefined || body.id === null) {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
          }
          return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
      }
    }

    // MCP endpoint — GET (SSE) and DELETE (session teardown) not supported
    if (url.pathname === "/mcp" && (request.method === "GET" || request.method === "DELETE")) {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: "POST, OPTIONS",
          ...CORS_HEADERS,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Legacy HTTP endpoints (unchanged)
    // -----------------------------------------------------------------------

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" });
    }

    // Tool listing
    if (url.pathname === "/tools") {
      return jsonResponse({ tools: TOOLS });
    }

    // Execute search_shaders
    if (url.pathname === "/search_shaders") {
      try {
        const params = request.method === "POST"
          ? (await request.json()) as Record<string, unknown>
          : Object.fromEntries(url.searchParams);
        const results = await handleSearchShaders(
          params as { query?: string; category?: string; pipeline?: string; environment?: string; tags?: string[] },
          registryUrl,
        );
        return jsonResponse(results);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Search failed" }, 500);
      }
    }

    // Execute get_shader
    if (url.pathname === "/get_shader") {
      try {
        const params = request.method === "POST"
          ? (await request.json()) as Record<string, unknown>
          : Object.fromEntries(url.searchParams);
        if (!params.name || typeof params.name !== "string") {
          return jsonResponse({ error: "Missing required parameter: name" }, 400);
        }
        const result = await handleGetShader(
          params as { name: string; environment?: string },
          registryUrl,
        );
        return jsonResponse(result);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Get shader failed" }, 500);
      }
    }

    // Default informational response
    return jsonResponse({
      name: "@shaderbase/mcp",
      version: "0.1.0",
      description:
        "ShaderBase MCP Server — search and retrieve Three.js shaders for AI agents.",
      endpoints: {
        "/health": "Health check",
        "/tools": "List available MCP tools and their input schemas",
        "/search_shaders": "Execute search_shaders tool (GET with query params or POST with JSON body)",
        "/get_shader": "Execute get_shader tool (GET with ?name=... or POST with JSON body)",
        "/mcp": "MCP Streamable HTTP transport (POST with JSON-RPC 2.0)",
      },
    });
  },
};
