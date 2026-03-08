import assert from "node:assert/strict";
import type { RegistryIndex, RegistryShaderBundle } from "../../cli/src/registry-types.ts";
import { handleSearchShaders, handleGetShader, handleSubmitShader } from "./handlers.ts";

function runTest(name: string, callback: () => void | Promise<void>) {
  const result = callback();
  if (result instanceof Promise) {
    result.then(
      () => console.log(`ok ${name}`),
      (error) => {
        console.error(`not ok ${name}`);
        throw error;
      },
    );
    return result;
  }
  console.log(`ok ${name}`);
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockIndex: RegistryIndex = {
  version: "0.1.0",
  generatedAt: "2026-03-07T00:00:00Z",
  shaders: [
    {
      name: "gradient-radial",
      displayName: "Radial Gradient",
      version: "1.0.0",
      summary: "A smooth radial color gradient",
      tags: ["gradient", "color"],
      category: "color",
      pipeline: "surface",
      stage: "fragment",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "original",
      uniforms: [{ name: "uColor", type: "vec3" }],
    },
    {
      name: "vignette-postprocess",
      displayName: "Vignette Post-Process",
      version: "1.0.0",
      summary: "A vignette darkening effect for post-processing",
      tags: ["vignette", "post-processing"],
      category: "post-processing",
      pipeline: "postprocessing",
      stage: "fragment",
      environments: ["three", "react-three-fiber"],
      renderers: ["webgl2"],
      sourceKind: "original",
      uniforms: [{ name: "uIntensity", type: "float" }],
    },
  ],
};

const mockBundle: RegistryShaderBundle = {
  name: "gradient-radial",
  displayName: "Radial Gradient",
  version: "1.0.0",
  summary: "A smooth radial color gradient",
  tags: ["gradient", "color"],
  category: "color",
  pipeline: "surface",
  stage: "fragment",
  environments: ["three", "react-three-fiber"],
  renderers: ["webgl2"],
  sourceKind: "original",
  uniforms: [{ name: "uColor", type: "vec3" }],
  description: "Renders a smooth radial gradient between two colors.",
  author: { name: "ShaderBase" },
  license: "MIT",
  compatibility: {
    three: ">=0.150.0",
    renderers: ["webgl2"],
    material: "ShaderMaterial",
    environments: ["three", "react-three-fiber"],
  },
  capabilityProfile: {
    pipeline: "surface",
    stage: "fragment",
    requires: [],
    outputs: ["gl_FragColor"],
  },
  uniformsFull: [
    {
      name: "uColor",
      type: "vec3",
      defaultValue: [0.2, 0.4, 0.8],
      description: "The primary gradient color",
    },
  ],
  inputs: [],
  outputs: [
    { name: "gl_FragColor", kind: "vec4", description: "Final fragment color" },
  ],
  vertexSource: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentSource: "uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }",
  recipes: {
    three: {
      exportName: "createGradientRadialMaterial",
      summary: "Three.js ShaderMaterial for radial gradient",
      code: "import * as THREE from 'three';",
      placeholders: [],
      requirements: ["three"],
    },
    r3f: {
      exportName: "GradientRadial",
      summary: "React Three Fiber component for radial gradient",
      code: "import { shaderMaterial } from '@react-three/drei';",
      placeholders: [],
      requirements: ["@react-three/fiber", "@react-three/drei"],
    },
  },
  provenance: {
    sourceKind: "original",
    sources: [],
    attribution: {
      summary: "Original shader by ShaderBase.",
    },
  },
};

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

function createMockFetch(indexData: RegistryIndex, bundleData: RegistryShaderBundle) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.endsWith("/index.json")) {
      return new Response(JSON.stringify(indexData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Match /shaders/<name>.json
    const bundleMatch = url.match(/\/shaders\/([^/]+)\.json$/);
    if (bundleMatch && bundleMatch[1] === bundleData.name) {
      return new Response(JSON.stringify(bundleData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const mockFetch = createMockFetch(mockIndex, mockBundle);
const registryUrl = "https://registry.shaderbase.dev";

async function main() {
  await runTest("search_shaders returns matches", async () => {
    const results = await handleSearchShaders(
      { query: "gradient" },
      registryUrl,
      mockFetch,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]!.name, "gradient-radial");
  });

  await runTest("search_shaders returns empty for no matches", async () => {
    const results = await handleSearchShaders(
      { query: "nonexistent" },
      registryUrl,
      mockFetch,
    );
    assert.equal(results.length, 0);
  });

  await runTest("get_shader returns full bundle", async () => {
    const bundle = await handleGetShader(
      { name: "gradient-radial" },
      registryUrl,
      mockFetch,
    );
    assert.equal(bundle.name, "gradient-radial");
    assert.ok(bundle.vertexSource.length > 0);
    assert.ok(Object.keys(bundle.recipes).length === 2);
    assert.ok("three" in bundle.recipes);
    assert.ok("r3f" in bundle.recipes);
  });

  await runTest("get_shader filters by environment", async () => {
    const bundle = await handleGetShader(
      { name: "gradient-radial", environment: "three" },
      registryUrl,
      mockFetch,
    );
    assert.equal(bundle.name, "gradient-radial");
    assert.equal(Object.keys(bundle.recipes).length, 1);
    assert.ok("three" in bundle.recipes);
    assert.ok(!("r3f" in bundle.recipes));
  });

  // ---------------------------------------------------------------------------
  // submit_shader handler tests
  // ---------------------------------------------------------------------------

  await runTest("handleSubmitShader throws on missing source", async () => {
    await assert.rejects(
      () =>
        handleSubmitShader(
          { source: "" },
          { anthropicApiKey: "fake", githubToken: "fake" },
        ),
      /Missing required parameter: source/,
    );
  });

  await runTest("handleSubmitShader throws on invalid repo format", async () => {
    await assert.rejects(
      () =>
        handleSubmitShader(
          { source: "void main() {}" },
          { anthropicApiKey: "fake", githubToken: "fake", repo: "noslash" },
        ),
      /owner\/repo/,
    );
  });

  console.log("handlers tests passed");
}

main();
