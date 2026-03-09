import assert from "node:assert/strict";
import type { RegistryIndex } from "../registry-types.ts";
import { searchShaders } from "./search.ts";

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Mock index
// ---------------------------------------------------------------------------

function makeMockIndex(): RegistryIndex {
  return {
    version: "0.2.0",
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
        language: "glsl",
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
        language: "glsl",
      },
      {
        name: "simplex-displacement",
        displayName: "Simplex Displacement",
        version: "1.0.0",
        summary: "Vertex displacement driven by simplex noise",
        tags: ["noise", "displacement"],
        category: "geometry",
        pipeline: "geometry",
        stage: "vertex",
        environments: ["three", "react-three-fiber"],
        renderers: ["webgl2"],
        sourceKind: "adapted",
        uniforms: [{ name: "uAmplitude", type: "float" }],
        language: "glsl",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

runTest("returns all shaders with no filters", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, {});
  assert.equal(results.length, 3);
});

runTest("filters by text query matching name", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { query: "gradient" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "gradient-radial");
});

runTest("filters by text query matching summary", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { query: "vignette" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "vignette-postprocess");
});

runTest("filters by category", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { category: "geometry" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "simplex-displacement");
});

runTest("filters by pipeline", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { pipeline: "postprocessing" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "vignette-postprocess");
});

runTest("filters by environment", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { environment: "r3f" });
  assert.equal(results.length, 3);
});

runTest("filters by tag", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { tags: ["noise"] });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "simplex-displacement");
});

runTest("combines multiple filters", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { query: "gradient", pipeline: "surface" });
  assert.equal(results.length, 1);
  assert.equal(results[0]!.name, "gradient-radial");
});

runTest("returns empty for no matches", () => {
  const index = makeMockIndex();
  const results = searchShaders(index, { query: "nonexistent" });
  assert.equal(results.length, 0);
});

console.log("search tests passed");
