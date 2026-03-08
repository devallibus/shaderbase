import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateShaderManifestFile } from "../packages/schema/src/index.ts";
import type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryRecipeBundle,
  RegistryShaderBundle,
} from "../packages/cli/src/registry-types.ts";

type BuildRegistryOptions = {
  shadersRoot: string;
  outputDir: string;
};

export async function buildRegistry({ shadersRoot, outputDir }: BuildRegistryOptions) {
  if (!existsSync(shadersRoot)) {
    throw new Error(`Shaders root does not exist: ${shadersRoot}`);
  }

  const shaderDirs = readdirSync(shadersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(shadersRoot, name, "shader.json")));

  if (shaderDirs.length === 0) {
    throw new Error("No shader manifests found.");
  }

  const indexEntries: RegistryIndexEntry[] = [];
  const bundles: Array<{ name: string; bundle: RegistryShaderBundle }> = [];

  for (const dirName of shaderDirs) {
    const shaderDir = join(shadersRoot, dirName);
    const manifestPath = join(shaderDir, "shader.json");

    const manifest = validateShaderManifestFile(manifestPath);

    // Read GLSL source files
    const vertexSource = readFileSync(join(shaderDir, manifest.files.vertex), "utf8");
    const fragmentSource = readFileSync(join(shaderDir, manifest.files.fragment), "utf8");

    // Build recipes record (keyed by target)
    const recipes: Record<string, RegistryRecipeBundle> = {};
    for (const recipe of manifest.recipes) {
      const code = readFileSync(join(shaderDir, recipe.path), "utf8");
      recipes[recipe.target] = {
        exportName: recipe.exportName,
        summary: recipe.summary,
        code,
        placeholders: recipe.placeholders.map((p) => ({
          name: p.name,
          kind: p.kind,
          description: p.description,
          required: p.required,
          ...(p.example !== undefined ? { example: p.example } : {}),
        })),
        requirements: recipe.requirements,
      };
    }

    // Build uniform summaries for the index
    const uniformSummaries = manifest.uniforms.map((u) => ({
      name: u.name,
      type: u.type,
    }));

    // Build full uniforms for the bundle
    const uniformsFull = manifest.uniforms.map((u) => ({
      name: u.name,
      type: u.type,
      defaultValue: u.defaultValue,
      description: u.description,
      ...(u.min !== undefined ? { min: u.min } : {}),
      ...(u.max !== undefined ? { max: u.max } : {}),
    }));

    // Build provenance with all source fields passed through
    const provenance = {
      sourceKind: manifest.provenance.sourceKind,
      sources: manifest.provenance.sources.map((s) => ({
        name: s.name,
        kind: s.kind,
        url: s.url,
        ...(s.repositoryUrl !== undefined ? { repositoryUrl: s.repositoryUrl } : {}),
        ...(s.revision !== undefined ? { revision: s.revision } : {}),
        ...(s.retrievedAt !== undefined ? { retrievedAt: s.retrievedAt } : {}),
        license: s.license,
        authors: s.authors,
        ...(s.copyrightNotice !== undefined ? { copyrightNotice: s.copyrightNotice } : {}),
        ...(s.notes !== undefined ? { notes: s.notes } : {}),
      })),
      attribution: {
        summary: manifest.provenance.attribution.summary,
        ...(manifest.provenance.attribution.requiredNotice !== undefined
          ? { requiredNotice: manifest.provenance.attribution.requiredNotice }
          : {}),
      },
      ...(manifest.provenance.notes !== undefined ? { notes: manifest.provenance.notes } : {}),
    };

    // Index entry
    const indexEntry: RegistryIndexEntry = {
      name: manifest.name,
      displayName: manifest.displayName,
      version: manifest.version,
      summary: manifest.summary,
      tags: manifest.tags,
      category: manifest.category,
      pipeline: manifest.capabilityProfile.pipeline,
      stage: manifest.capabilityProfile.stage,
      environments: manifest.compatibility.environments,
      renderers: manifest.compatibility.renderers,
      sourceKind: manifest.provenance.sourceKind,
      uniforms: uniformSummaries,
    };

    indexEntries.push(indexEntry);

    // Shader bundle
    const bundle: RegistryShaderBundle = {
      // Index-level fields
      name: manifest.name,
      displayName: manifest.displayName,
      version: manifest.version,
      summary: manifest.summary,
      tags: manifest.tags,
      category: manifest.category,
      pipeline: manifest.capabilityProfile.pipeline,
      stage: manifest.capabilityProfile.stage,
      environments: manifest.compatibility.environments,
      renderers: manifest.compatibility.renderers,
      sourceKind: manifest.provenance.sourceKind,
      uniforms: uniformSummaries,

      // Extended fields
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      compatibility: manifest.compatibility,
      capabilityProfile: manifest.capabilityProfile,
      uniformsFull,
      inputs: manifest.inputs,
      outputs: manifest.outputs,
      vertexSource,
      fragmentSource,
      recipes,
      provenance,
    };

    bundles.push({ name: manifest.name, bundle });
  }

  // Sort index entries alphabetically by name
  indexEntries.sort((a, b) => a.name.localeCompare(b.name));

  const registryIndex: RegistryIndex = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    shaders: indexEntries,
  };

  // Create output directories
  const shadersOutputDir = join(outputDir, "shaders");
  mkdirSync(shadersOutputDir, { recursive: true });

  // Write index.json
  writeFileSync(join(outputDir, "index.json"), JSON.stringify(registryIndex, null, 2));

  // Write per-shader bundles
  for (const { name, bundle } of bundles) {
    writeFileSync(join(shadersOutputDir, `${name}.json`), JSON.stringify(bundle, null, 2));
  }

  console.log(`Built registry: ${bundles.length} shader(s) written to ${outputDir}`);
}

// CLI entry point
const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]).replace(/\\/g, "/") ===
    resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).replace(/\\/g, "/");

if (isDirectRun) {
  const shadersRoot = resolve(process.cwd(), "shaders");
  const outputDir = resolve(process.cwd(), "dist/registry");

  buildRegistry({ shadersRoot, outputDir }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
