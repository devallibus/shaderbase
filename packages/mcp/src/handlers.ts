import type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryShaderBundle,
} from "../../cli/src/registry-types.ts";
import { searchShaders } from "../../cli/src/commands/search.ts";

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
