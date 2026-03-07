import type { RegistryIndex, RegistryShaderBundle } from "../registry-types.ts";

const DEFAULT_REGISTRY_URL = "https://registry.shaderbase.dev";

export function getRegistryUrl(): string {
  return process.env.SHADERBASE_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

export async function fetchIndex(registryUrl?: string): Promise<RegistryIndex> {
  const base = registryUrl ?? getRegistryUrl();
  const response = await fetch(`${base}/index.json`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry index: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as RegistryIndex;
}

export async function fetchShaderBundle(
  name: string,
  registryUrl?: string,
): Promise<RegistryShaderBundle> {
  const base = registryUrl ?? getRegistryUrl();
  const response = await fetch(`${base}/shaders/${name}.json`);
  if (!response.ok) {
    throw new Error(
      `Shader "${name}" not found: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as RegistryShaderBundle;
}
