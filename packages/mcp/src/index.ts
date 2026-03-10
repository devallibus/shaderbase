// ---------------------------------------------------------------------------
// ShaderBase MCP Server — Cloudflare Worker
// ---------------------------------------------------------------------------

import { handleSearchShaders, handleGetShader, handleSubmitShader } from "./handlers.ts";
import {
  handleCreatePlayground,
  handleUpdateShader,
  handleGetPreview,
  handleGetErrors,
} from "./playground-handlers.ts";

interface Env {
  REGISTRY_URL?: string;
  ANTHROPIC_API_KEY?: string;
  GITHUB_TOKEN?: string;
  WEB_APP_URL?: string;
  PLAYGROUND_SECRET?: string;
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

type McpTextContent = {
  type: "text";
  text: string;
};

type McpImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

type McpContentItem = McpTextContent | McpImageContent;

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
        language: {
          type: "string",
          enum: ["glsl", "tsl"],
          description: "Filter by shader language ('glsl' or 'tsl').",
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
  {
    name: "submit_shader",
    description:
      "Submit a shader to the ShaderBase registry. AI analyzes the code, extracts metadata, and creates a GitHub pull request.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description:
            "Raw GLSL code, a Shadertoy URL, a GitHub gist URL, or a GitHub file URL.",
        },
      },
      required: ["source"],
      additionalProperties: false,
    },
  },
  {
    name: "create_playground",
    description:
      "Create a new shader playground session for live editing and preview.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vertexSource: { type: "string", description: "Initial vertex shader GLSL source." },
        fragmentSource: { type: "string", description: "Initial fragment shader GLSL source." },
        language: {
          type: "string",
          enum: ["glsl", "tsl"],
          description: "Shader language: 'glsl' (default) or 'tsl'.",
        },
        tslSource: {
          type: "string",
          description: "TSL source code (when language is 'tsl').",
        },
        uniforms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              defaultValue: {},
              description: { type: "string" },
              min: { type: "number" },
              max: { type: "number" },
            },
            required: ["name", "type", "defaultValue"],
          },
          description: "Uniform definitions for the shader.",
        },
        pipeline: { type: "string", description: "Rendering pipeline: 'surface', 'postprocessing', or 'geometry'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "update_shader",
    description:
      "Update shader source in a playground session. Returns compilation errors, structured errors, and a screenshot when a browser preview is connected.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "The playground session ID." },
        vertexSource: { type: "string", description: "New vertex shader GLSL source." },
        fragmentSource: { type: "string", description: "New fragment shader GLSL source." },
        tslSource: {
          type: "string",
          description: "New TSL source code (for TSL sessions).",
        },
      },
      required: ["sessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_preview",
    description:
      "Get the latest screenshot from a playground session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "The playground session ID." },
      },
      required: ["sessionId"],
      additionalProperties: false,
    },
  },
  {
    name: "get_errors",
    description:
      "Get compilation errors and structured errors from a playground session.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "The playground session ID." },
      },
      required: ["sessionId"],
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
        language: {
          type: "string",
          enum: ["glsl", "tsl"],
          description: "Filter by shader language ('glsl' or 'tsl').",
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
  {
    name: "submit_shader",
    description:
      "Submit a shader to the ShaderBase registry. Provide raw GLSL code, a Shadertoy URL, a GitHub gist URL, or a GitHub file URL. AI analyzes the shader, extracts metadata, generates a manifest, and creates a GitHub pull request. Returns the PR URL and number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Raw GLSL code, Shadertoy URL, gist URL, or GitHub file URL",
        },
      },
      required: ["source"] as const,
    },
  },
  {
    name: "create_playground",
    description:
      "Create a new shader playground session for live editing. Supports both GLSL and TSL languages. When a browser has the playground open, both can render a live preview and return screenshots. Returns a session ID, URL, and previewAvailable flag.",
    inputSchema: {
      type: "object" as const,
      properties: {
        vertexSource: {
          type: "string",
          description: "Initial vertex shader GLSL source (defaults to a basic pass-through)",
        },
        fragmentSource: {
          type: "string",
          description: "Initial fragment shader GLSL source (defaults to an animated color gradient)",
        },
        language: {
          type: "string",
          enum: ["glsl", "tsl"],
          description: "Shader language: 'glsl' (default) or 'tsl'.",
        },
        tslSource: {
          type: "string",
          description: "TSL source code (when language is 'tsl').",
        },
        uniforms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              defaultValue: {},
              description: { type: "string" },
              min: { type: "number" },
              max: { type: "number" },
            },
            required: ["name", "type", "defaultValue"],
          },
          description: "Uniform definitions (name, type, defaultValue, optional min/max/description)",
        },
        pipeline: {
          type: "string",
          description: "Rendering pipeline: 'surface' (default), 'postprocessing', or 'geometry'",
        },
      },
    },
  },
  {
    name: "update_shader",
    description:
      "Update shader source in a playground session. For GLSL sessions, provide vertexSource/fragmentSource. For TSL sessions, provide tslSource. Returns compilation errors, structured errors (with kind and message), and a screenshot when a browser preview is connected. The previewAvailable flag indicates the session supports live preview.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "The playground session ID from create_playground",
        },
        vertexSource: {
          type: "string",
          description: "New vertex shader GLSL source (GLSL sessions only)",
        },
        fragmentSource: {
          type: "string",
          description: "New fragment shader GLSL source (GLSL sessions only)",
        },
        tslSource: {
          type: "string",
          description: "New TSL source code (TSL sessions only)",
        },
      },
      required: ["sessionId"] as const,
    },
  },
  {
    name: "get_preview",
    description:
      "Get the latest screenshot from a playground session. Returns the most recent rendered frame as a PNG image when a browser preview has uploaded one.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "The playground session ID from create_playground",
        },
      },
      required: ["sessionId"] as const,
    },
  },
  {
    name: "get_errors",
    description:
      "Get compilation errors from a playground session. Returns plain error strings and structured errors (with kind like 'glsl-compile', 'tsl-parse', 'tsl-runtime', 'tsl-material-build' and message).",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description: "The playground session ID from create_playground",
        },
      },
      required: ["sessionId"] as const,
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
  env: Env,
): Promise<{ content: McpContentItem[] }> {
  if (toolName === "search_shaders") {
    const results = await handleSearchShaders(
      toolArgs as {
        query?: string;
        category?: string;
        pipeline?: string;
        environment?: string;
        tags?: string[];
        language?: string;
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

  if (toolName === "submit_shader") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    }
    if (!env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is not configured on the server.");
    }
    const result = await handleSubmitShader(
      toolArgs as { source: string },
      {
        anthropicApiKey: env.ANTHROPIC_API_KEY,
        githubToken: env.GITHUB_TOKEN,
      },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  // -------------------------------------------------------------------------
  // Playground tools
  // -------------------------------------------------------------------------

  const playgroundEnv = {
    webAppUrl: env.WEB_APP_URL ?? "https://shaderbase.com",
    playgroundSecret: env.PLAYGROUND_SECRET ?? "",
  };

  if (toolName === "create_playground") {
    const result = await handleCreatePlayground(
      toolArgs as {
        vertexSource?: string;
        fragmentSource?: string;
        tslSource?: string;
        language?: string;
        pipeline?: string;
      },
      playgroundEnv,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (toolName === "update_shader") {
    if (!toolArgs.sessionId || typeof toolArgs.sessionId !== "string") {
      throw new Error("Missing required parameter: sessionId");
    }
    const result = await handleUpdateShader(
      toolArgs as { sessionId: string; vertexSource?: string; fragmentSource?: string; tslSource?: string },
      playgroundEnv,
    );

    const content: McpContentItem[] = [];

    // Always include text status
    content.push({
      type: "text",
      text: JSON.stringify({
        compilationErrors: result.compilationErrors,
        structuredErrors: result.structuredErrors,
        browserConnected: result.browserConnected,
        previewAvailable: result.previewAvailable,
      }, null, 2),
    });

    // Include screenshot as image content if available
    if (result.screenshotBase64) {
      // Strip data URI prefix if present
      const base64Data = result.screenshotBase64.replace(/^data:image\/png;base64,/, "");
      content.push({
        type: "image",
        data: base64Data,
        mimeType: "image/png",
      });
    }

    return { content };
  }

  if (toolName === "get_preview") {
    if (!toolArgs.sessionId || typeof toolArgs.sessionId !== "string") {
      throw new Error("Missing required parameter: sessionId");
    }
    const result = await handleGetPreview(
      toolArgs as { sessionId: string },
      playgroundEnv,
    );

    if (result.screenshotBase64) {
      const base64Data = result.screenshotBase64.replace(/^data:image\/png;base64,/, "");
      return {
        content: [{ type: "image", data: base64Data, mimeType: "image/png" }],
      };
    }
    return {
      content: [{ type: "text", text: "No screenshot available yet. Make sure a browser has the playground open." }],
    };
  }

  if (toolName === "get_errors") {
    if (!toolArgs.sessionId || typeof toolArgs.sessionId !== "string") {
      throw new Error("Missing required parameter: sessionId");
    }
    const result = await handleGetErrors(
      toolArgs as { sessionId: string },
      playgroundEnv,
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
            const result = await handleMcpToolCall(toolName, toolArgs, registryUrl, env);
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

    // Execute submit_shader (POST only)
    if (url.pathname === "/submit_shader" && request.method === "POST") {
      try {
        if (!env.ANTHROPIC_API_KEY) {
          return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured on the server." }, 500);
        }
        if (!env.GITHUB_TOKEN) {
          return jsonResponse({ error: "GITHUB_TOKEN is not configured on the server." }, 500);
        }
        const params = (await request.json()) as Record<string, unknown>;
        if (!params.source || typeof params.source !== "string") {
          return jsonResponse({ error: "Missing required parameter: source" }, 400);
        }
        const result = await handleSubmitShader(
          params as { source: string },
          {
            anthropicApiKey: env.ANTHROPIC_API_KEY,
            githubToken: env.GITHUB_TOKEN,
          },
        );
        return jsonResponse(result);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Submit failed" }, 500);
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
        "/submit_shader": "Execute submit_shader tool (POST with JSON body: { source: string })",
        "/mcp": "MCP Streamable HTTP transport (POST with JSON-RPC 2.0)",
      },
    });
  },
};
