import type { RegistryIndex, RegistryIndexEntry } from "../registry-types.ts";

// ---------------------------------------------------------------------------
// Search filters
// ---------------------------------------------------------------------------

export type SearchFilters = {
  query?: string;
  category?: string;
  pipeline?: string;
  environment?: string;
  tags?: string[];
  language?: string;
};

// ---------------------------------------------------------------------------
// Environment alias normalization
// ---------------------------------------------------------------------------

const ENVIRONMENT_ALIASES: Record<string, string> = {
  r3f: "react-three-fiber",
};

function normalizeEnvironment(env: string): string {
  const lower = env.toLowerCase();
  return ENVIRONMENT_ALIASES[lower] ?? lower;
}

// ---------------------------------------------------------------------------
// Search implementation
// ---------------------------------------------------------------------------

export function searchShaders(
  index: RegistryIndex,
  filters: SearchFilters,
): RegistryIndexEntry[] {
  const { query, category, pipeline, environment, tags, language } = filters;

  return index.shaders.filter((shader) => {
    // query — case-insensitive match against name, displayName, summary, or any tag
    if (query) {
      const q = query.toLowerCase();
      const matchesQuery =
        shader.name.toLowerCase().includes(q) ||
        shader.displayName.toLowerCase().includes(q) ||
        shader.summary.toLowerCase().includes(q) ||
        shader.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchesQuery) return false;
    }

    // language — exact case-insensitive match
    if (language) {
      if ((shader.language ?? "glsl").toLowerCase() !== language.toLowerCase()) return false;
    }

    // category — exact case-insensitive match
    if (category) {
      if (shader.category.toLowerCase() !== category.toLowerCase()) return false;
    }

    // pipeline — exact case-insensitive match
    if (pipeline) {
      if (shader.pipeline.toLowerCase() !== pipeline.toLowerCase()) return false;
    }

    // environment — normalize aliases, then check inclusion
    if (environment) {
      const normalized = normalizeEnvironment(environment);
      const shaderEnvs = shader.environments.map((e) => e.toLowerCase());
      if (!shaderEnvs.includes(normalized)) return false;
    }

    // tags — all specified tags must be present (case-insensitive)
    if (tags && tags.length > 0) {
      const shaderTags = shader.tags.map((t) => t.toLowerCase());
      const allPresent = tags.every((t) => shaderTags.includes(t.toLowerCase()));
      if (!allPresent) return false;
    }

    return true;
  });
}
