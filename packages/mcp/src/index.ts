// ---------------------------------------------------------------------------
// ShaderBase MCP Server — Cloudflare Worker
// ---------------------------------------------------------------------------

import { handleSearchShaders, handleGetShader } from "./handlers.ts";

interface Env {
  REGISTRY_URL?: string;
}

const DEFAULT_REGISTRY_URL = "https://shaderbase-registry.pages.dev";

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
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const registryUrl = env.REGISTRY_URL ?? DEFAULT_REGISTRY_URL;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

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
      },
    });
  },
};
