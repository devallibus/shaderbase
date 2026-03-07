// ---------------------------------------------------------------------------
// ShaderBase MCP Server — Cloudflare Worker
// ---------------------------------------------------------------------------
//
// Exposes search_shaders and get_shader tool metadata over HTTP.
// Full MCP protocol (SSE transport, @modelcontextprotocol/sdk) will be wired
// in a future iteration. For now this serves:
//   /health  → health check
//   /tools   → MCP tool listing with input schemas
//   *        → informational text
// ---------------------------------------------------------------------------

import { handleSearchShaders, handleGetShader } from "./handlers.ts";

interface Env {
  REGISTRY_URL?: string;
}

const DEFAULT_REGISTRY_URL = "https://registry.shaderbase.dev";

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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const registryUrl = env.REGISTRY_URL ?? DEFAULT_REGISTRY_URL;

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" });
    }

    // Tool listing
    if (url.pathname === "/tools") {
      return jsonResponse({ tools: TOOLS });
    }

    // Default informational response
    return jsonResponse({
      name: "@shaderbase/mcp",
      version: "0.1.0",
      description:
        "ShaderBase MCP Server — exposes search_shaders and get_shader tools for AI agents.",
      endpoints: {
        "/health": "Health check",
        "/tools": "List available MCP tools and their input schemas",
      },
    });
  },
};
