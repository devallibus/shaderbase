import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RegistryShaderBundle } from "../registry-types.ts";

// ---------------------------------------------------------------------------
// Write options
// ---------------------------------------------------------------------------

export type WriteOptions = {
  targetDir: string;
  environment?: "three" | "r3f";
};

// ---------------------------------------------------------------------------
// Fallback recipe file names (used when relPath is not in the bundle)
// ---------------------------------------------------------------------------

const RECIPE_FILE_NAMES: Record<string, string> = {
  three: "three.ts",
  r3f: "r3f.tsx",
};

// ---------------------------------------------------------------------------
// Add implementation
// ---------------------------------------------------------------------------

export function writeShaderFiles(
  bundle: RegistryShaderBundle,
  options: WriteOptions,
): string[] {
  const shaderDir = join(options.targetDir, bundle.name);

  if (existsSync(shaderDir)) {
    throw new Error(`Directory "${shaderDir}" already exists`);
  }

  mkdirSync(shaderDir, { recursive: true });

  const writtenPaths: string[] = [];

  // Write source files based on language
  if (bundle.language === "tsl") {
    const tslPath = join(shaderDir, "source.ts");
    writeFileSync(tslPath, bundle.tslSource, "utf-8");
    writtenPaths.push(tslPath);
  } else {
    const vertexPath = join(shaderDir, "vertex.glsl");
    writeFileSync(vertexPath, bundle.vertexSource, "utf-8");
    writtenPaths.push(vertexPath);

    const fragmentPath = join(shaderDir, "fragment.glsl");
    writeFileSync(fragmentPath, bundle.fragmentSource, "utf-8");
    writtenPaths.push(fragmentPath);
  }

  // Determine which recipes to write
  const recipeKeys = options.environment
    ? [options.environment]
    : Object.keys(bundle.recipes);

  for (const key of recipeKeys) {
    const recipe = bundle.recipes[key];
    if (!recipe) continue;

    // Use relPath from bundle if available, otherwise fall back to flat filename
    const relFile = recipe.relPath ?? RECIPE_FILE_NAMES[key];
    if (!relFile) continue;

    const recipePath = join(shaderDir, relFile);
    // Ensure subdirectories exist (e.g. recipes/)
    mkdirSync(dirname(recipePath), { recursive: true });
    writeFileSync(recipePath, recipe.code, "utf-8");
    writtenPaths.push(recipePath);
  }

  return writtenPaths;
}
