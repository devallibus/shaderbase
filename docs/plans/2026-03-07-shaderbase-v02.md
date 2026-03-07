# ShaderBase v0.2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform ShaderBase from a git-backed shader corpus into a full agent-first registry with CLI, MCP server, static registry, and a cleaned-up web app — the "shadcn for shaders."

**Architecture:** shadcn-style distribution model. A build script generates static registry JSON (index + per-shader bundles with inlined GLSL and recipes). CI builds the registry and deploys to CDN. A CLI (`npx shaderbase add <name>`) fetches from the CDN and copies source files into the user's project. A remote MCP server on Cloudflare Workers exposes `search_shaders` and `get_shader` tools for agent-native access. The web app is cleaned up: manual submission form removed, AI-only submit flow that creates GitHub PRs, reviews migrated from local SQLite to Cloudflare D1.

**Tech Stack:** Bun monorepo, TypeScript (strict), Zod, Cloudflare Workers + Pages, SolidJS + TanStack Start + Nitro, MCP SDK, GitHub API

**Key Decisions:**
- Distribution: shadcn-style (copy source into project, user owns code)
- Registry: static generated JSON, CI build artifact (not committed to git)
- CLI: `shaderbase` on npm, convention `src/shaders/<name>/`, `--dir` override
- MCP: remote-only Cloudflare Worker, SSE transport, read-only (search + get)
- No separate SDK package — CLI has the core logic
- Web submit: AI-only parse, creates GitHub PR on approve
- Hosting: Cloudflare (Workers + Pages), Railway fallback
- Reviews: migrate to Cloudflare D1
- Tracking: GitHub issues + milestones

---

## Parallel Tracks

**Track A** (Registry + Agent Interface): Tasks 1-7
**Track B** (Web App Cleanup + Tests): Tasks 8-13
**Track C** (CI/CD + Deployment): Tasks 14-16

Tracks A and B are independent and can run in parallel.
Track C depends on A and B being complete.

---

## Track A: Registry + CLI + MCP

### Task 1: Registry Index Schema and Types

**Files:**
- Create: `packages/cli/src/registry-types.ts`
- Test: `packages/cli/src/registry-types.test.ts`

**Step 1: Scaffold the CLI package**

Create `packages/cli/package.json`:
```json
{
  "name": "shaderbase",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "shaderbase": "./dist/bin.js"
  },
  "main": "./src/index.ts",
  "scripts": {
    "build": "bun build src/bin.ts --outdir dist --target node",
    "test": "node --experimental-strip-types src/registry-types.test.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

Create `packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 2: Write the failing test for registry types**

Create `packages/cli/src/registry-types.test.ts`:
```typescript
import assert from "node:assert/strict";
import { registryIndexEntrySchema, registryShaderBundleSchema } from "./registry-types.ts";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

const validIndexEntry = {
  name: "gradient-radial",
  displayName: "Radial Gradient",
  version: "0.1.0",
  summary: "A small surface shader that blends two colors.",
  tags: ["gradient", "radial", "color"],
  category: "color",
  pipeline: "surface",
  stage: "vertex-and-fragment",
  environments: ["three", "react-three-fiber"],
  renderers: ["webgl2"],
  sourceKind: "original",
  uniforms: [
    { name: "uInnerColor", type: "vec3" },
    { name: "uRadius", type: "float" },
  ],
};

runTest("validates a valid index entry", () => {
  const result = registryIndexEntrySchema.safeParse(validIndexEntry);
  assert.equal(result.success, true);
});

runTest("rejects index entry without name", () => {
  const { name, ...rest } = validIndexEntry;
  const result = registryIndexEntrySchema.safeParse(rest);
  assert.equal(result.success, false);
});

const validBundle = {
  ...validIndexEntry,
  description: "Full description here.",
  author: { name: "ShaderBase" },
  license: "MIT",
  compatibility: {
    three: ">=0.160.0",
    renderers: ["webgl2"],
    material: "shader-material",
    environments: ["three", "react-three-fiber"],
  },
  capabilityProfile: {
    pipeline: "surface",
    stage: "vertex-and-fragment",
    requires: ["uv"],
    outputs: ["color", "alpha"],
  },
  uniformsFull: [
    {
      name: "uInnerColor",
      type: "vec3",
      defaultValue: [1, 0.76, 0.32],
      description: "RGB color at the center.",
    },
  ],
  inputs: [{ name: "uv", kind: "uv", description: "Mesh UV coordinates.", required: true }],
  outputs: [{ name: "baseColor", kind: "color", description: "Gradient color." }],
  vertexSource: "varying vec2 vUv;\nvoid main() { vUv = uv; }",
  fragmentSource: "void main() { gl_FragColor = vec4(1.0); }",
  recipes: {
    three: {
      exportName: "createGradientRadialMaterial",
      summary: "Create a ShaderMaterial.",
      code: "export function createGradientRadialMaterial() {}",
      placeholders: [],
      requirements: ["three-scene", "mesh"],
    },
  },
  provenance: {
    sourceKind: "original",
    attribution: { summary: "Original work." },
  },
};

runTest("validates a valid shader bundle", () => {
  const result = registryShaderBundleSchema.safeParse(validBundle);
  assert.equal(result.success, true);
});

runTest("rejects bundle without vertexSource", () => {
  const { vertexSource, ...rest } = validBundle;
  const result = registryShaderBundleSchema.safeParse(rest);
  assert.equal(result.success, false);
});

console.log("registry-types tests passed");
```

**Step 3: Run test to verify it fails**

Run: `node --experimental-strip-types packages/cli/src/registry-types.test.ts`
Expected: FAIL — module not found

**Step 4: Write the registry types**

Create `packages/cli/src/registry-types.ts`:
```typescript
import { z } from "zod";

export const registryUniformSummarySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
});

export const registryIndexEntrySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  version: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string()).min(1),
  category: z.string().min(1),
  pipeline: z.string().min(1),
  stage: z.string().min(1),
  environments: z.array(z.string()).min(1),
  renderers: z.array(z.string()).min(1),
  sourceKind: z.string().min(1),
  uniforms: z.array(registryUniformSummarySchema),
});

export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>;

export const registryIndexSchema = z.object({
  version: z.literal("0.1.0"),
  generatedAt: z.string(),
  shaders: z.array(registryIndexEntrySchema),
});

export type RegistryIndex = z.infer<typeof registryIndexSchema>;

const recipeBundle = z.object({
  exportName: z.string().min(1),
  summary: z.string().min(1),
  code: z.string().min(1),
  placeholders: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    description: z.string(),
    required: z.boolean(),
    example: z.string().optional(),
  })),
  requirements: z.array(z.string()),
});

export const registryShaderBundleSchema = registryIndexEntrySchema.extend({
  description: z.string().min(1),
  author: z.object({
    name: z.string().min(1),
    github: z.string().optional(),
    url: z.string().optional(),
  }),
  license: z.string().min(1),
  compatibility: z.object({
    three: z.string(),
    renderers: z.array(z.string()),
    material: z.string(),
    environments: z.array(z.string()),
  }),
  capabilityProfile: z.object({
    pipeline: z.string(),
    stage: z.string(),
    requires: z.array(z.string()),
    outputs: z.array(z.string()),
  }),
  uniformsFull: z.array(z.object({
    name: z.string(),
    type: z.string(),
    defaultValue: z.union([z.number(), z.boolean(), z.string(), z.null(), z.array(z.number())]),
    description: z.string(),
    min: z.number().optional(),
    max: z.number().optional(),
  })),
  inputs: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    description: z.string(),
    required: z.boolean(),
  })),
  outputs: z.array(z.object({
    name: z.string(),
    kind: z.string(),
    description: z.string(),
  })),
  vertexSource: z.string().min(1),
  fragmentSource: z.string().min(1),
  recipes: z.record(z.string(), recipeBundle),
  provenance: z.object({
    sourceKind: z.string(),
    sources: z.array(z.object({
      name: z.string(),
      kind: z.string(),
      url: z.string(),
      repositoryUrl: z.string().optional(),
      revision: z.string().optional(),
      retrievedAt: z.string().optional(),
      license: z.string(),
      authors: z.array(z.string()),
      copyrightNotice: z.string().optional(),
      notes: z.string().optional(),
    })).optional(),
    attribution: z.object({
      summary: z.string(),
      requiredNotice: z.string().optional(),
    }),
    notes: z.string().optional(),
  }),
});

export type RegistryShaderBundle = z.infer<typeof registryShaderBundleSchema>;
```

**Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types packages/cli/src/registry-types.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/cli/
git commit -m "feat: add registry index and shader bundle schemas for CLI package"
```

---

### Task 2: Build-Registry Script

**Files:**
- Create: `scripts/build-registry.ts`
- Test: `scripts/build-registry.test.ts`

**Step 1: Write the failing test**

Create `scripts/build-registry.test.ts`:
```typescript
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

// Import the build function (will fail until implemented)
import { buildRegistry } from "./build-registry.ts";

const fixtureShaderDir = join(process.cwd(), "shaders", "gradient-radial");

runTest("builds registry from shader corpus", async () => {
  const tempOutput = mkdtempSync(join(tmpdir(), "registry-"));

  try {
    await buildRegistry({
      shadersRoot: join(process.cwd(), "shaders"),
      outputDir: tempOutput,
    });

    // Check index.json was created
    const indexRaw = readFileSync(join(tempOutput, "index.json"), "utf8");
    const index = JSON.parse(indexRaw);
    assert.equal(index.version, "0.1.0");
    assert.ok(index.shaders.length >= 3, "Should have at least 3 shaders");

    // Check per-shader bundles
    const gradientBundle = JSON.parse(
      readFileSync(join(tempOutput, "shaders", "gradient-radial.json"), "utf8"),
    );
    assert.equal(gradientBundle.name, "gradient-radial");
    assert.ok(gradientBundle.vertexSource.includes("vUv"));
    assert.ok(gradientBundle.fragmentSource.includes("uInnerColor"));
    assert.ok(gradientBundle.recipes.three);
    assert.ok(gradientBundle.recipes.three.code.includes("createGradientRadialMaterial"));

    // Check a bundle has proper uniform summaries in index
    const indexEntry = index.shaders.find((s: { name: string }) => s.name === "gradient-radial");
    assert.ok(indexEntry);
    assert.ok(indexEntry.uniforms.length > 0);
    assert.equal(indexEntry.uniforms[0].name, "uInnerColor");
    assert.equal(indexEntry.uniforms[0].type, "vec3");
  } finally {
    rmSync(tempOutput, { force: true, recursive: true });
  }
});

console.log("build-registry tests passed");
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types scripts/build-registry.test.ts`
Expected: FAIL — buildRegistry not found

**Step 3: Write the build-registry script**

Create `scripts/build-registry.ts`:
```typescript
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateShaderManifestFile } from "../packages/schema/src/index.ts";
import type { RegistryIndex, RegistryIndexEntry, RegistryShaderBundle } from "../packages/cli/src/registry-types.ts";

type BuildRegistryOptions = {
  shadersRoot: string;
  outputDir: string;
};

export async function buildRegistry({ shadersRoot, outputDir }: BuildRegistryOptions): Promise<void> {
  const shaderDirs = readdirSync(shadersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(shadersRoot, entry.name, "shader.json")));

  if (shaderDirs.length === 0) {
    throw new Error("No shader manifests found.");
  }

  const indexEntries: RegistryIndexEntry[] = [];

  mkdirSync(join(outputDir, "shaders"), { recursive: true });

  for (const dir of shaderDirs) {
    const shaderDir = join(shadersRoot, dir.name);
    const manifest = validateShaderManifestFile(join(shaderDir, "shader.json"));

    const vertexSource = readFileSync(join(shaderDir, manifest.files.vertex), "utf8");
    const fragmentSource = readFileSync(join(shaderDir, manifest.files.fragment), "utf8");

    const recipes: Record<string, {
      exportName: string;
      summary: string;
      code: string;
      placeholders: Array<{ name: string; kind: string; description: string; required: boolean; example?: string }>;
      requirements: string[];
    }> = {};

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
          example: p.example,
        })),
        requirements: recipe.requirements,
      };
    }

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
      uniforms: manifest.uniforms.map((u) => ({ name: u.name, type: u.type })),
    };

    const bundle: RegistryShaderBundle = {
      ...indexEntry,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      compatibility: manifest.compatibility,
      capabilityProfile: manifest.capabilityProfile,
      uniformsFull: manifest.uniforms,
      inputs: manifest.inputs,
      outputs: manifest.outputs,
      vertexSource,
      fragmentSource,
      recipes,
      provenance: {
        sourceKind: manifest.provenance.sourceKind,
        sources: manifest.provenance.sources,
        attribution: manifest.provenance.attribution,
        notes: manifest.provenance.notes,
      },
    };

    writeFileSync(
      join(outputDir, "shaders", `${manifest.name}.json`),
      JSON.stringify(bundle, null, 2),
    );

    indexEntries.push(indexEntry);
  }

  const index: RegistryIndex = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    shaders: indexEntries.sort((a, b) => a.name.localeCompare(b.name)),
  };

  writeFileSync(join(outputDir, "index.json"), JSON.stringify(index, null, 2));

  console.log(`Built registry: ${indexEntries.length} shader(s) -> ${outputDir}`);
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("build-registry.ts")) {
  const shadersRoot = resolve(process.cwd(), "shaders");
  const outputDir = resolve(process.cwd(), "dist", "registry");

  buildRegistry({ shadersRoot, outputDir }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types scripts/build-registry.test.ts`
Expected: All tests PASS

**Step 5: Add build:registry script to root package.json**

Add to `package.json` scripts:
```json
"build:registry": "node --experimental-strip-types scripts/build-registry.ts"
```

Also add `dist/` to `.gitignore` if not already present.

**Step 6: Commit**

```bash
git add scripts/build-registry.ts scripts/build-registry.test.ts package.json
git commit -m "feat: add build-registry script to generate static JSON from shader corpus"
```

---

### Task 3: CLI Search Command

**Files:**
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/commands/search.ts`
- Create: `packages/cli/src/lib/registry-client.ts`
- Test: `packages/cli/src/commands/search.test.ts`

**Step 1: Write the failing test**

Create `packages/cli/src/commands/search.test.ts`:
```typescript
import assert from "node:assert/strict";
import { searchShaders } from "./search.ts";
import type { RegistryIndex } from "../registry-types.ts";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

const mockIndex: RegistryIndex = {
  version: "0.1.0",
  generatedAt: "2026-03-07T00:00:00.000Z",
  shaders: [
    {
      name: "gradient-radial",
      displayName: "Radial Gradient",
      version: "0.1.0",
      summary: "A radial gradient surface shader.",
      tags: ["gradient", "radial", "color", "surface"],
      category: "color",
      pipeline: "surface",
      stage: "vertex-and-fragment",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "original",
      uniforms: [{ name: "uInnerColor", type: "vec3" }],
    },
    {
      name: "vignette-postprocess",
      displayName: "Vignette Post-Process",
      version: "0.1.0",
      summary: "A vignette darkening effect for post-processing.",
      tags: ["vignette", "post-process", "screen"],
      category: "post-processing",
      pipeline: "postprocessing",
      stage: "fullscreen-pass",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "adapted",
      uniforms: [{ name: "uOffset", type: "float" }],
    },
    {
      name: "simplex-displacement",
      displayName: "Simplex Displacement",
      version: "0.1.0",
      summary: "Vertex displacement using simplex noise.",
      tags: ["noise", "displacement", "geometry"],
      category: "geometry",
      pipeline: "geometry",
      stage: "vertex-and-fragment",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "adapted",
      uniforms: [{ name: "uAmplitude", type: "float" }],
    },
  ],
};

runTest("returns all shaders with no filters", () => {
  const results = searchShaders(mockIndex, {});
  assert.equal(results.length, 3);
});

runTest("filters by text query matching name", () => {
  const results = searchShaders(mockIndex, { query: "gradient" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "gradient-radial");
});

runTest("filters by text query matching summary", () => {
  const results = searchShaders(mockIndex, { query: "vignette" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "vignette-postprocess");
});

runTest("filters by category", () => {
  const results = searchShaders(mockIndex, { category: "geometry" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "simplex-displacement");
});

runTest("filters by pipeline", () => {
  const results = searchShaders(mockIndex, { pipeline: "postprocessing" });
  assert.equal(results.length, 1);
});

runTest("filters by environment", () => {
  const results = searchShaders(mockIndex, { environment: "r3f" });
  // All three support r3f via "react-three-fiber"
  assert.equal(results.length, 3);
});

runTest("filters by tag", () => {
  const results = searchShaders(mockIndex, { tags: ["noise"] });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "simplex-displacement");
});

runTest("combines multiple filters", () => {
  const results = searchShaders(mockIndex, { query: "shader", pipeline: "surface" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "gradient-radial");
});

runTest("returns empty for no matches", () => {
  const results = searchShaders(mockIndex, { query: "nonexistent" });
  assert.equal(results.length, 0);
});

console.log("search tests passed");
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types packages/cli/src/commands/search.test.ts`
Expected: FAIL — module not found

**Step 3: Implement search logic**

Create `packages/cli/src/commands/search.ts`:
```typescript
import type { RegistryIndex, RegistryIndexEntry } from "../registry-types.ts";

type SearchFilters = {
  query?: string;
  category?: string;
  pipeline?: string;
  environment?: string;
  tags?: string[];
};

export function searchShaders(index: RegistryIndex, filters: SearchFilters): RegistryIndexEntry[] {
  let results = index.shaders;

  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (filters.category) {
    const cat = filters.category.toLowerCase();
    results = results.filter((s) => s.category.toLowerCase() === cat);
  }

  if (filters.pipeline) {
    const pipe = filters.pipeline.toLowerCase();
    results = results.filter((s) => s.pipeline.toLowerCase() === pipe);
  }

  if (filters.environment) {
    const env = filters.environment.toLowerCase();
    const envMap: Record<string, string> = {
      r3f: "react-three-fiber",
      three: "three",
      "react-three-fiber": "react-three-fiber",
    };
    const normalized = envMap[env] ?? env;
    results = results.filter((s) => s.environments.includes(normalized));
  }

  if (filters.tags && filters.tags.length > 0) {
    const filterTags = filters.tags.map((t) => t.toLowerCase());
    results = results.filter((s) =>
      filterTags.every((ft) => s.tags.some((st) => st.toLowerCase() === ft)),
    );
  }

  return results;
}
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types packages/cli/src/commands/search.test.ts`
Expected: All tests PASS

**Step 5: Create registry client (HTTP fetcher)**

Create `packages/cli/src/lib/registry-client.ts`:
```typescript
import type { RegistryIndex, RegistryShaderBundle } from "../registry-types.ts";

const DEFAULT_REGISTRY_URL = "https://registry.shaderbase.dev";

export function getRegistryUrl(): string {
  return process.env.SHADERBASE_REGISTRY_URL ?? DEFAULT_REGISTRY_URL;
}

export async function fetchIndex(registryUrl?: string): Promise<RegistryIndex> {
  const base = registryUrl ?? getRegistryUrl();
  const response = await fetch(`${base}/index.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch registry index: ${response.status} ${response.statusText}`);
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
    throw new Error(`Shader "${name}" not found: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as RegistryShaderBundle;
}
```

**Step 6: Commit**

```bash
git add packages/cli/src/commands/ packages/cli/src/lib/
git commit -m "feat: add search command with filtering and registry HTTP client"
```

---

### Task 4: CLI Add Command

**Files:**
- Create: `packages/cli/src/commands/add.ts`
- Test: `packages/cli/src/commands/add.test.ts`

**Step 1: Write the failing test**

Create `packages/cli/src/commands/add.test.ts`:
```typescript
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeShaderFiles } from "./add.ts";
import type { RegistryShaderBundle } from "../registry-types.ts";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

const mockBundle: RegistryShaderBundle = {
  name: "gradient-radial",
  displayName: "Radial Gradient",
  version: "0.1.0",
  summary: "A radial gradient shader.",
  description: "Full description.",
  tags: ["gradient"],
  category: "color",
  pipeline: "surface",
  stage: "vertex-and-fragment",
  environments: ["three", "react-three-fiber"],
  renderers: ["webgl2"],
  sourceKind: "original",
  uniforms: [{ name: "uInnerColor", type: "vec3" }],
  author: { name: "ShaderBase" },
  license: "MIT",
  compatibility: {
    three: ">=0.160.0",
    renderers: ["webgl2"],
    material: "shader-material",
    environments: ["three", "react-three-fiber"],
  },
  capabilityProfile: {
    pipeline: "surface",
    stage: "vertex-and-fragment",
    requires: ["uv"],
    outputs: ["color", "alpha"],
  },
  uniformsFull: [
    { name: "uInnerColor", type: "vec3", defaultValue: [1, 0.76, 0.32], description: "Center color." },
  ],
  inputs: [{ name: "uv", kind: "uv", description: "UVs.", required: true }],
  outputs: [{ name: "baseColor", kind: "color", description: "Color." }],
  vertexSource: "void main() { gl_Position = vec4(0.0); }",
  fragmentSource: "void main() { gl_FragColor = vec4(1.0); }",
  recipes: {
    three: {
      exportName: "createGradientRadialMaterial",
      summary: "Three.js recipe.",
      code: "export function createGradientRadialMaterial() { return null; }",
      placeholders: [],
      requirements: ["three-scene"],
    },
    r3f: {
      exportName: "GradientRadialMaterial",
      summary: "R3F recipe.",
      code: "export function GradientRadialMaterial() { return null; }",
      placeholders: [],
      requirements: ["canvas"],
    },
  },
  provenance: {
    sourceKind: "original",
    attribution: { summary: "Original." },
  },
};

runTest("writes shader files for three environment", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "shaderbase-add-"));
  try {
    const written = writeShaderFiles(mockBundle, {
      targetDir: tempDir,
      environment: "three",
    });

    assert.ok(existsSync(join(tempDir, "gradient-radial", "vertex.glsl")));
    assert.ok(existsSync(join(tempDir, "gradient-radial", "fragment.glsl")));
    assert.ok(existsSync(join(tempDir, "gradient-radial", "three.ts")));
    assert.ok(!existsSync(join(tempDir, "gradient-radial", "r3f.tsx")));

    const vertex = readFileSync(join(tempDir, "gradient-radial", "vertex.glsl"), "utf8");
    assert.ok(vertex.includes("gl_Position"));

    const recipe = readFileSync(join(tempDir, "gradient-radial", "three.ts"), "utf8");
    assert.ok(recipe.includes("createGradientRadialMaterial"));

    assert.ok(written.length === 3);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

runTest("writes shader files for r3f environment", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "shaderbase-add-"));
  try {
    writeShaderFiles(mockBundle, {
      targetDir: tempDir,
      environment: "r3f",
    });

    assert.ok(existsSync(join(tempDir, "gradient-radial", "vertex.glsl")));
    assert.ok(existsSync(join(tempDir, "gradient-radial", "fragment.glsl")));
    assert.ok(existsSync(join(tempDir, "gradient-radial", "r3f.tsx")));
    assert.ok(!existsSync(join(tempDir, "gradient-radial", "three.ts")));
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

runTest("writes all recipes when no environment specified", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "shaderbase-add-"));
  try {
    writeShaderFiles(mockBundle, { targetDir: tempDir });

    assert.ok(existsSync(join(tempDir, "gradient-radial", "three.ts")));
    assert.ok(existsSync(join(tempDir, "gradient-radial", "r3f.tsx")));
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

runTest("throws if shader directory already exists", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "shaderbase-add-"));
  try {
    writeShaderFiles(mockBundle, { targetDir: tempDir });
    assert.throws(
      () => writeShaderFiles(mockBundle, { targetDir: tempDir }),
      /already exists/,
    );
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

console.log("add command tests passed");
```

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types packages/cli/src/commands/add.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the add command**

Create `packages/cli/src/commands/add.ts`:
```typescript
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RegistryShaderBundle } from "../registry-types.ts";

type WriteOptions = {
  targetDir: string;
  environment?: "three" | "r3f";
};

const recipeExtensions: Record<string, string> = {
  three: ".ts",
  r3f: ".tsx",
};

export function writeShaderFiles(bundle: RegistryShaderBundle, options: WriteOptions): string[] {
  const shaderDir = join(options.targetDir, bundle.name);

  if (existsSync(shaderDir)) {
    throw new Error(`Directory "${shaderDir}" already exists. Remove it first or use a different --dir.`);
  }

  mkdirSync(shaderDir, { recursive: true });

  const written: string[] = [];

  const vertexPath = join(shaderDir, "vertex.glsl");
  writeFileSync(vertexPath, bundle.vertexSource);
  written.push(vertexPath);

  const fragmentPath = join(shaderDir, "fragment.glsl");
  writeFileSync(fragmentPath, bundle.fragmentSource);
  written.push(fragmentPath);

  const recipesToWrite = options.environment
    ? Object.entries(bundle.recipes).filter(([target]) => target === options.environment)
    : Object.entries(bundle.recipes);

  for (const [target, recipe] of recipesToWrite) {
    const ext = recipeExtensions[target] ?? ".ts";
    const recipePath = join(shaderDir, `${target}${ext}`);
    writeFileSync(recipePath, recipe.code);
    written.push(recipePath);
  }

  return written;
}
```

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types packages/cli/src/commands/add.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/cli/src/commands/add.ts packages/cli/src/commands/add.test.ts
git commit -m "feat: add CLI add command — writes shader files into user's project"
```

---

### Task 5: CLI Binary Entry Point

**Files:**
- Create: `packages/cli/src/bin.ts`
- Create: `packages/cli/src/index.ts`

**Step 1: Implement the CLI entry point**

Create `packages/cli/src/bin.ts`:
```typescript
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { searchShaders } from "./commands/search.ts";
import { writeShaderFiles } from "./commands/add.ts";
import { fetchIndex, fetchShaderBundle } from "./lib/registry-client.ts";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "search": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          query: { type: "string", short: "q" },
          category: { type: "string", short: "c" },
          pipeline: { type: "string", short: "p" },
          environment: { type: "string", short: "e" },
          tag: { type: "string", multiple: true, short: "t" },
          json: { type: "boolean" },
        },
        strict: false,
      });

      const index = await fetchIndex();
      const results = searchShaders(index, {
        query: values.query,
        category: values.category,
        pipeline: values.pipeline,
        environment: values.environment,
        tags: values.tag,
      });

      if (values.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.length === 0) {
          console.log("No shaders found.");
          return;
        }
        for (const shader of results) {
          console.log(`${shader.name} — ${shader.summary}`);
          console.log(`  category: ${shader.category} | pipeline: ${shader.pipeline} | tags: ${shader.tags.join(", ")}`);
          console.log();
        }
      }
      break;
    }

    case "add": {
      const shaderName = args[1];
      if (!shaderName) {
        console.error("Usage: shaderbase add <shader-name> [--env three|r3f] [--dir <path>]");
        process.exit(1);
      }

      const { values } = parseArgs({
        args: args.slice(2),
        options: {
          env: { type: "string", short: "e" },
          dir: { type: "string", short: "d" },
        },
        strict: false,
      });

      const targetDir = resolve(values.dir ?? "src/shaders");
      const environment = values.env as "three" | "r3f" | undefined;

      console.log(`Fetching ${shaderName}...`);
      const bundle = await fetchShaderBundle(shaderName);

      const written = writeShaderFiles(bundle, { targetDir, environment });

      console.log(`Added ${shaderName} to ${targetDir}/${shaderName}/`);
      for (const file of written) {
        console.log(`  ${file}`);
      }
      break;
    }

    default:
      console.log("shaderbase - agent-first shader registry for Three.js");
      console.log();
      console.log("Commands:");
      console.log("  search    Search for shaders in the registry");
      console.log("  add       Add a shader to your project");
      console.log();
      console.log("Examples:");
      console.log("  shaderbase search -q gradient");
      console.log("  shaderbase add gradient-radial --env r3f");
      console.log("  shaderbase add gradient-radial --dir src/shaders --env three");
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

Create `packages/cli/src/index.ts` (programmatic exports):
```typescript
export { searchShaders } from "./commands/search.ts";
export { writeShaderFiles } from "./commands/add.ts";
export { fetchIndex, fetchShaderBundle } from "./lib/registry-client.ts";
export type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryShaderBundle,
} from "./registry-types.ts";
```

**Step 2: Verify build works**

Run: `cd packages/cli && bun build src/bin.ts --outdir dist --target node`
Expected: Build succeeds, `dist/bin.js` created

**Step 3: Commit**

```bash
git add packages/cli/src/bin.ts packages/cli/src/index.ts
git commit -m "feat: add CLI binary entry point with search and add commands"
```

---

### Task 6: MCP Server Package

**Files:**
- Create: `packages/mcp/package.json`
- Create: `packages/mcp/src/index.ts`
- Create: `packages/mcp/wrangler.toml`
- Test: `packages/mcp/src/index.test.ts`

**Step 1: Scaffold the MCP package**

Create `packages/mcp/package.json`:
```json
{
  "name": "@shaderbase/mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "node --experimental-strip-types src/index.test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.0.0"
  }
}
```

Create `packages/mcp/wrangler.toml`:
```toml
name = "shaderbase-mcp"
main = "src/index.ts"
compatibility_date = "2026-03-01"

[vars]
REGISTRY_URL = "https://registry.shaderbase.dev"
```

Create `packages/mcp/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*.ts"]
}
```

**Step 2: Write the failing test for MCP tool handlers**

Create `packages/mcp/src/index.test.ts`:
```typescript
import assert from "node:assert/strict";
import { handleSearchShaders, handleGetShader } from "./handlers.ts";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

const mockIndex = {
  version: "0.1.0" as const,
  generatedAt: "2026-03-07T00:00:00.000Z",
  shaders: [
    {
      name: "gradient-radial",
      displayName: "Radial Gradient",
      version: "0.1.0",
      summary: "A radial gradient shader.",
      tags: ["gradient", "radial"],
      category: "color",
      pipeline: "surface",
      stage: "vertex-and-fragment",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "original",
      uniforms: [{ name: "uInnerColor", type: "vec3" }],
    },
  ],
};

const mockBundle = {
  ...mockIndex.shaders[0]!,
  description: "Full desc.",
  author: { name: "ShaderBase" },
  license: "MIT",
  compatibility: { three: ">=0.160.0", renderers: ["webgl2"], material: "shader-material", environments: ["three"] },
  capabilityProfile: { pipeline: "surface", stage: "vertex-and-fragment", requires: ["uv"], outputs: ["color"] },
  uniformsFull: [{ name: "uInnerColor", type: "vec3", defaultValue: [1, 0.76, 0.32], description: "Color." }],
  inputs: [],
  outputs: [{ name: "baseColor", kind: "color", description: "Color." }],
  vertexSource: "void main() {}",
  fragmentSource: "void main() {}",
  recipes: { three: { exportName: "create", summary: "Create.", code: "export function create() {}", placeholders: [], requirements: [] } },
  provenance: { sourceKind: "original", attribution: { summary: "Original." } },
};

// Mock fetch for tests
const mockFetch = (url: string) => {
  if (url.endsWith("/index.json")) {
    return Promise.resolve(new Response(JSON.stringify(mockIndex)));
  }
  if (url.endsWith("/gradient-radial.json")) {
    return Promise.resolve(new Response(JSON.stringify(mockBundle)));
  }
  return Promise.resolve(new Response("Not found", { status: 404 }));
};

runTest("search_shaders returns matches", async () => {
  const result = await handleSearchShaders({ query: "gradient" }, mockFetch);
  assert.ok(result.length === 1);
  assert.equal(result[0]!.name, "gradient-radial");
});

runTest("search_shaders returns empty for no matches", async () => {
  const result = await handleSearchShaders({ query: "nonexistent" }, mockFetch);
  assert.equal(result.length, 0);
});

runTest("get_shader returns full bundle", async () => {
  const result = await handleGetShader({ name: "gradient-radial" }, mockFetch);
  assert.equal(result.name, "gradient-radial");
  assert.ok(result.vertexSource);
  assert.ok(result.recipes.three);
});

runTest("get_shader filters by environment", async () => {
  const result = await handleGetShader({ name: "gradient-radial", environment: "three" }, mockFetch);
  assert.ok(result.recipes.three);
  assert.ok(!result.recipes.r3f);
});

console.log("mcp handler tests passed");
```

**Step 3: Run test to verify it fails**

Run: `node --experimental-strip-types packages/mcp/src/index.test.ts`
Expected: FAIL — handlers module not found

**Step 4: Implement the MCP tool handlers**

Create `packages/mcp/src/handlers.ts`:
```typescript
import type { RegistryIndex, RegistryIndexEntry, RegistryShaderBundle } from "../../cli/src/registry-types.ts";
import { searchShaders } from "../../cli/src/commands/search.ts";

type FetchFn = (url: string) => Promise<Response>;

const REGISTRY_URL = "https://registry.shaderbase.dev";

function getRegistryUrl(): string {
  return REGISTRY_URL;
}

export async function handleSearchShaders(
  params: { query?: string; category?: string; pipeline?: string; environment?: string; tags?: string[] },
  fetchFn: FetchFn = fetch,
): Promise<RegistryIndexEntry[]> {
  const base = getRegistryUrl();
  const response = await fetchFn(`${base}/index.json`);
  if (!response.ok) throw new Error("Failed to fetch registry index");
  const index = (await response.json()) as RegistryIndex;

  return searchShaders(index, params);
}

export async function handleGetShader(
  params: { name: string; environment?: string },
  fetchFn: FetchFn = fetch,
): Promise<RegistryShaderBundle> {
  const base = getRegistryUrl();
  const response = await fetchFn(`${base}/shaders/${params.name}.json`);
  if (!response.ok) throw new Error(`Shader "${params.name}" not found`);
  const bundle = (await response.json()) as RegistryShaderBundle;

  if (params.environment) {
    const filteredRecipes: Record<string, typeof bundle.recipes[string]> = {};
    if (bundle.recipes[params.environment]) {
      filteredRecipes[params.environment] = bundle.recipes[params.environment];
    }
    return { ...bundle, recipes: filteredRecipes };
  }

  return bundle;
}
```

**Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types packages/mcp/src/index.test.ts`
Expected: All tests PASS

**Step 6: Implement the Cloudflare Worker MCP server**

Create `packages/mcp/src/index.ts`:
```typescript
import { handleSearchShaders, handleGetShader } from "./handlers.ts";

// Cloudflare Worker MCP server using SSE transport
// This is a simplified implementation — use @modelcontextprotocol/sdk
// with the Cloudflare Workers adapter when setting up the full server.

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }

    // MCP tool list
    if (url.pathname === "/tools") {
      return new Response(
        JSON.stringify({
          tools: [
            {
              name: "search_shaders",
              description: "Search the ShaderBase registry for Three.js shaders. Returns matching shaders with metadata.",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Text search across name, summary, tags" },
                  category: { type: "string", description: "Filter by category (e.g., color, geometry, post-processing)" },
                  pipeline: { type: "string", description: "Filter by pipeline (surface, postprocessing, geometry, utility)" },
                  environment: { type: "string", enum: ["three", "r3f"], description: "Filter by target environment" },
                  tags: { type: "array", items: { type: "string" }, description: "Filter by tags (all must match)" },
                },
              },
            },
            {
              name: "get_shader",
              description: "Get full shader details including GLSL source and recipe code, ready to copy into a project.",
              inputSchema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Shader name (kebab-case)" },
                  environment: { type: "string", enum: ["three", "r3f"], description: "Only return recipe for this environment" },
                },
                required: ["name"],
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    // Placeholder for full MCP SSE transport — to be wired with @modelcontextprotocol/sdk
    return new Response("ShaderBase MCP Server. See /tools for available tools.", {
      headers: { "content-type": "text/plain" },
    });
  },
};
```

**Step 7: Commit**

```bash
git add packages/mcp/
git commit -m "feat: add MCP server package with search and get handlers for Cloudflare Workers"
```

---

### Task 7: Update Root Workspace and Test Scripts

**Files:**
- Modify: `package.json` (root)
- Modify: `tsconfig.json` (root)
- Modify: `tsconfig.base.json`

**Step 1: Update root package.json**

Add to `scripts`:
```json
"build:registry": "node --experimental-strip-types scripts/build-registry.ts",
"test:cli": "node --experimental-strip-types packages/cli/src/registry-types.test.ts && node --experimental-strip-types packages/cli/src/commands/search.test.ts && node --experimental-strip-types packages/cli/src/commands/add.test.ts",
"test:mcp": "node --experimental-strip-types packages/mcp/src/index.test.ts",
"test:registry": "node --experimental-strip-types scripts/build-registry.test.ts",
"test": "node --experimental-strip-types packages/schema/src/index.test.ts && bun run test:cli && bun run test:mcp && bun run test:registry",
"check": "bun run test && bun run typecheck && bun run validate:shaders && bun run build:web"
```

Add path aliases to `tsconfig.base.json`:
```json
"paths": {
  "@shaderbase/schema": ["packages/schema/src/index.ts"],
  "@shaderbase/cli": ["packages/cli/src/index.ts"]
}
```

**Step 2: Run all tests**

Run: `bun run test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "chore: update workspace config with CLI, MCP, and registry test scripts"
```

---

## Track B: Web App Cleanup + Tests

### Task 8: Remove Manual Submission Form

**Files:**
- Delete: `apps/web/src/lib/submission-draft.ts`
- Modify: `apps/web/src/routes/submit.tsx` — gut the manual form, keep AI-only flow
- Delete: `submissions/` directory contents (keep README or remove entirely)

**Step 1: Read current submit.tsx and submission-draft.ts to understand dependencies**

Read and identify all imports of `submission-draft.ts` across the web app.

Run: `grep -r "submission-draft" apps/web/src/`

**Step 2: Remove submission-draft.ts**

Delete the file. It contains manual form builder logic (createDefaultFormData, createUniformRow, buildDraftArtifact) that is replaced by the AI-only flow.

**Step 3: Update submit.tsx**

Rewrite to simplified flow:
1. User pastes GLSL / URL
2. AI parses (existing `aiParseShader` + `resolveShaderSource`)
3. User reviews AI result (read-only display, not editable form)
4. User approves → creates GitHub PR via GitHub API

Remove: form field editors, manual uniform row creation, step-by-step form wizard.
Keep: AI parsing integration, authentication check, status display.

**Step 4: Remove submissions/ filesystem write logic**

Remove any server function that writes to `submissions/` on the local filesystem. This is replaced by GitHub PR creation.

**Step 5: Verify the web app still builds**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove manual submission form, simplify to AI-only flow"
```

---

### Task 9: Add GitHub PR Creation to Submit Flow

**Files:**
- Create: `apps/web/src/lib/server/github-pr.ts`
- Modify: `apps/web/src/routes/submit.tsx`

**Step 1: Implement GitHub PR creation server function**

Create `apps/web/src/lib/server/github-pr.ts`:
```typescript
import { createServerFn } from "@tanstack/solid-start";

type CreateShaderPRInput = {
  name: string;
  manifest: Record<string, unknown>;
  vertexSource: string;
  fragmentSource: string;
  recipes: Record<string, string>;
  previewSvg?: string;
};

export const createShaderPR = createServerFn({ method: "POST" })
  .inputValidator((input: CreateShaderPRInput) => input)
  .handler(async ({ data }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN not configured");

    const owner = "your-org"; // TODO: configure from env
    const repo = "shaderbase";
    const branch = `shader/${data.name}`;
    const base = "master";

    // 1. Get latest commit SHA on master
    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${base}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    const refData = await refRes.json() as { object: { sha: string } };
    const baseSha = refData.object.sha;

    // 2. Create blobs for each file
    async function createBlob(content: string): Promise<string> {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({ content, encoding: "utf-8" }),
      });
      const blob = await res.json() as { sha: string };
      return blob.sha;
    }

    const files: Array<{ path: string; sha: string }> = [];
    files.push({ path: `shaders/${data.name}/shader.json`, sha: await createBlob(JSON.stringify(data.manifest, null, 2)) });
    files.push({ path: `shaders/${data.name}/vertex.glsl`, sha: await createBlob(data.vertexSource) });
    files.push({ path: `shaders/${data.name}/fragment.glsl`, sha: await createBlob(data.fragmentSource) });
    for (const [target, code] of Object.entries(data.recipes)) {
      const ext = target === "r3f" ? ".tsx" : ".ts";
      files.push({ path: `shaders/${data.name}/recipes/${target}${ext}`, sha: await createBlob(code) });
    }
    if (data.previewSvg) {
      files.push({ path: `shaders/${data.name}/preview.svg`, sha: await createBlob(data.previewSvg) });
    }

    // 3. Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        base_tree: baseSha,
        tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha })),
      }),
    });
    const treeData = await treeRes.json() as { sha: string };

    // 4. Create commit
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `feat: add ${data.name} shader\n\nSubmitted via ShaderBase web app.`,
        tree: treeData.sha,
        parents: [baseSha],
      }),
    });
    const commitData = await commitRes.json() as { sha: string };

    // 5. Create branch
    await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitData.sha }),
    });

    // 6. Create PR
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Add shader: ${data.name}`,
        head: branch,
        base,
        body: `## New Shader Submission\n\n**Name:** ${data.name}\n**Category:** ${(data.manifest as Record<string, unknown>).category}\n\nSubmitted via the ShaderBase web app AI parser.`,
      }),
    });
    const prData = await prRes.json() as { html_url: string; number: number };

    return { url: prData.html_url, number: prData.number };
  });
```

**Step 2: Wire into submit.tsx**

Update the submit route to call `createShaderPR` after user approves the AI-parsed result.

**Step 3: Verify web app builds**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add apps/web/src/lib/server/github-pr.ts apps/web/src/routes/submit.tsx
git commit -m "feat: add GitHub PR creation for shader submissions"
```

---

### Task 10: Migrate Reviews to Cloudflare D1

**Files:**
- Modify: `apps/web/src/lib/server/reviews-db.ts`

**Step 1: Read current reviews-db.ts**

Understand the current SQLite API.

**Step 2: Refactor reviews-db.ts to use D1 bindings**

Replace `better-sqlite3` / `node:sqlite` calls with D1's HTTP-based SQL API (or Cloudflare D1 bindings if running on Workers). The SQL stays the same — D1 is SQLite-compatible.

For local dev, keep a SQLite fallback. For production, use D1 bindings via the Nitro Cloudflare preset.

**Step 3: Create D1 migration file**

Create `apps/web/migrations/0001_reviews.sql`:
```sql
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shader_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  source TEXT DEFAULT 'web',
  agent_context TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_shader ON reviews(shader_name);
```

**Step 4: Verify web app builds**

Run: `cd apps/web && bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/web/src/lib/server/reviews-db.ts apps/web/migrations/
git commit -m "refactor: migrate reviews from local SQLite to Cloudflare D1"
```

---

### Task 11: Web App Server Function Tests

**Files:**
- Create: `apps/web/src/lib/server/shaders.test.ts`
- Create: `apps/web/src/lib/server/shader-detail.test.ts`

**Step 1: Write tests for listShaders**

Test that `listShaders` correctly reads from the shader corpus and returns proper `ShaderEntry` objects. Use the real filesystem (the corpus exists in the repo).

**Step 2: Write tests for getShaderDetail**

Test that `getShaderDetail` returns full detail including inlined GLSL source and recipe code for a known shader.

**Step 3: Run tests**

Run: `node --experimental-strip-types apps/web/src/lib/server/shaders.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add apps/web/src/lib/server/*.test.ts
git commit -m "test: add server function tests for listShaders and getShaderDetail"
```

---

### Task 12: AI Parse Tests

**Files:**
- Create: `apps/web/src/lib/server/ai-parse.test.ts`

**Step 1: Write tests for resolveShaderSource**

Test the URL resolution logic with mocked fetch:
- Raw GLSL passthrough
- Shadertoy URL parsing (mock API response)
- GitHub gist URL parsing (mock API response)
- GitHub file URL parsing (mock raw content fetch)
- Invalid URL handling

**Step 2: Run tests**

Expected: All PASS

**Step 3: Commit**

```bash
git add apps/web/src/lib/server/ai-parse.test.ts
git commit -m "test: add AI parse source resolution tests"
```

---

### Task 13: Reviews DB Tests

**Files:**
- Create: `apps/web/src/lib/server/reviews-db.test.ts`

**Step 1: Write tests for reviews CRUD**

Test addReview, getReviewsForShader, getAverageRating, getAllShaderRatings using an in-memory or temp SQLite database.

**Step 2: Run tests**

Expected: All PASS

**Step 3: Commit**

```bash
git add apps/web/src/lib/server/reviews-db.test.ts
git commit -m "test: add reviews database CRUD tests"
```

---

## Track C: CI/CD + Deployment

### Task 14: CI Registry Build Workflow

**Files:**
- Modify: `.github/workflows/validate.yml`

**Step 1: Add registry build step to CI**

Add after validation:
```yaml
      - name: Build Registry
        run: bun run build:registry

      - name: Upload Registry Artifact
        uses: actions/upload-artifact@v4
        with:
          name: registry
          path: dist/registry/
```

**Step 2: Add a deploy job for Cloudflare Pages (runs only on master push)**

```yaml
  deploy-registry:
    needs: check
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.8
      - run: bun install --frozen-lockfile
      - run: bun run build:registry
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist/registry --project-name=shaderbase-registry
```

**Step 3: Commit**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: add registry build and Cloudflare Pages deploy to CI pipeline"
```

---

### Task 15: Cloudflare Deployment for Web App

**Files:**
- Create: `apps/web/wrangler.toml` (or Cloudflare Pages config)
- Modify: `apps/web/app.config.ts` — add cloudflare preset

**Step 1: Configure Nitro for Cloudflare**

Update the Nitro/Vinxi config to use the `cloudflare-pages` preset.

**Step 2: Add D1 binding configuration**

In `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "shaderbase-reviews"
database_id = "<to-be-created>"
```

**Step 3: Add deploy workflow step**

Add to CI:
```yaml
  deploy-web:
    needs: check
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: cd apps/web && bun run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy apps/web/.output/public --project-name=shaderbase-web
```

**Step 4: Commit**

```bash
git add apps/web/wrangler.toml .github/workflows/validate.yml
git commit -m "ci: add Cloudflare Pages deployment for web app with D1 reviews"
```

---

### Task 16: Deploy MCP Server to Cloudflare Workers

**Files:**
- Modify: `packages/mcp/wrangler.toml`

**Step 1: Add deploy workflow step**

```yaml
  deploy-mcp:
    needs: check
    if: github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy --config packages/mcp/wrangler.toml
```

**Step 2: Verify full CI pipeline**

Run: Push to a feature branch, verify all jobs pass.

**Step 3: Commit**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: add Cloudflare Workers deployment for MCP server"
```

---

## Post-Implementation

### Task 17: Create GitHub Issues + Milestone

Create a GitHub milestone "v0.2 — Agent-First Registry" and issues for each completed track:

1. **Static registry build pipeline** — build-registry script generates index.json + per-shader bundles
2. **CLI package (shaderbase)** — search and add commands, published to npm
3. **MCP server** — remote Cloudflare Worker with search_shaders + get_shader tools
4. **Web app cleanup** — removed manual form, AI-only submit, GitHub PR creation
5. **Reviews migration** — local SQLite to Cloudflare D1
6. **Comprehensive tests** — schema, CLI, MCP, web server functions, AI parse, reviews
7. **CI/CD pipeline** — registry build, web deploy, MCP deploy on Cloudflare

### Task 18: Update Documentation

- Update `README.md` with new architecture (CLI, MCP, registry)
- Update `CLAUDE.md` with new commands and registry build info
- Update `docs/git-contract.md` to list registry as derived artifact
