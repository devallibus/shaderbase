import type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryShaderBundle,
} from "../../cli/src/registry-types.ts";
import { searchShaders } from "../../cli/src/commands/search.ts";
import { resolveSource } from "../../cli/src/lib/resolve-source.ts";
import { aiParseShader } from "../../cli/src/lib/ai-parse.ts";
import { buildManifest } from "../../cli/src/lib/build-manifest.ts";
import { createShaderPR } from "../../cli/src/lib/github-pr.ts";

// ---------------------------------------------------------------------------
// search_shaders handler
// ---------------------------------------------------------------------------

export async function handleSearchShaders(
  params: {
    query?: string;
    category?: string;
    pipeline?: string;
    environment?: string;
    tags?: string[];
  },
  registryUrl: string,
  fetchFn: (input: string | URL | Request) => Promise<Response> = fetch,
): Promise<RegistryIndexEntry[]> {
  const response = await fetchFn(`${registryUrl}/index.json`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry index: ${response.status} ${response.statusText}`,
    );
  }
  const index = (await response.json()) as RegistryIndex;
  return searchShaders(index, params);
}

// ---------------------------------------------------------------------------
// get_shader handler
// ---------------------------------------------------------------------------

export async function handleGetShader(
  params: { name: string; environment?: string },
  registryUrl: string,
  fetchFn: (input: string | URL | Request) => Promise<Response> = fetch,
): Promise<RegistryShaderBundle> {
  const response = await fetchFn(`${registryUrl}/shaders/${params.name}.json`);
  if (!response.ok) {
    throw new Error(
      `Shader "${params.name}" not found: ${response.status} ${response.statusText}`,
    );
  }
  const bundle = (await response.json()) as RegistryShaderBundle;

  if (params.environment) {
    const env = params.environment.toLowerCase();
    const filtered: Record<string, (typeof bundle.recipes)[string]> = {};
    for (const [key, recipe] of Object.entries(bundle.recipes)) {
      if (key.toLowerCase() === env) {
        filtered[key] = recipe;
      }
    }
    return { ...bundle, recipes: filtered };
  }

  return bundle;
}

// ---------------------------------------------------------------------------
// submit_shader handler
// ---------------------------------------------------------------------------

export async function handleSubmitShader(
  params: { source: string },
  env: { anthropicApiKey: string; githubToken: string; repo?: string },
): Promise<{ prUrl: string; prNumber: number; shaderName: string }> {
  if (!params.source || typeof params.source !== "string") {
    throw new Error("Missing required parameter: source");
  }

  const repoSlug = env.repo ?? "devallibus/shaderbase";
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    throw new Error(`repo must be in "owner/repo" format. Got: "${repoSlug}"`);
  }

  // 1. Resolve source
  const resolved = await resolveSource(params.source);

  // 2. AI parse
  const parsed = await aiParseShader(
    {
      code: resolved.code,
      sourceType: resolved.sourceType,
      metadata: resolved.metadata,
    },
    env.anthropicApiKey,
  );

  // 3. Build manifest
  const resolvedMeta = resolved.metadata
    ? {
        sourceType: resolved.sourceType,
        url: resolved.metadata.url,
        title: resolved.metadata.title,
        author: resolved.metadata.author,
      }
    : undefined;
  const manifest = buildManifest(parsed, resolvedMeta);

  // 4. Generate recipe
  const exportName = `create${parsed.displayName.replace(/\s+/g, "")}Material`;
  const recipes: Record<string, { code: string; fileName: string }> = {
    three: {
      fileName: "recipes/three.ts",
      code: [
        `import { ShaderMaterial } from "three";`,
        ``,
        `// TODO: Configure uniforms and customize for your project`,
        `export function ${exportName}() {`,
        `  return new ShaderMaterial({`,
        `    vertexShader: "", // Load from vertex.glsl`,
        `    fragmentShader: "", // Load from fragment.glsl`,
        `    uniforms: {},`,
        `  });`,
        `}`,
      ].join("\n"),
    },
  };

  // 5. Generate preview SVG
  const previewSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
    '  <rect width="512" height="512" fill="#1a1a2e"/>',
    `  <text x="256" y="256" text-anchor="middle" fill="#e0e0e0" font-size="24">${parsed.displayName}</text>`,
    "</svg>",
  ].join("\n");

  // 6. Create PR
  const prResult = await createShaderPR(
    {
      name: parsed.name,
      manifest,
      vertexSource: parsed.vertexShader,
      fragmentSource: parsed.fragmentShader,
      recipes,
      previewSvg,
    },
    { token: env.githubToken, owner, repo },
  );

  return {
    prUrl: prResult.prUrl,
    prNumber: prResult.prNumber,
    shaderName: parsed.name,
  };
}
