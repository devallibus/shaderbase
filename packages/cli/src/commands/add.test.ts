import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { RegistryShaderBundle } from "../registry-types.ts";
import { writeShaderFiles } from "./add.ts";

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
// Mock bundle
// ---------------------------------------------------------------------------

function makeMockBundle(): RegistryShaderBundle {
  return {
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
    description: "A radial gradient shader that renders a smooth circular gradient.",
    author: { name: "ShaderBase" },
    license: "MIT",
    compatibility: {
      three: ">=0.150.0",
      renderers: ["webgl2"],
      material: "shader-material",
      environments: ["three", "react-three-fiber"],
    },
    capabilityProfile: {
      pipeline: "surface",
      stage: "fragment",
      requires: ["uv"],
      outputs: ["color"],
    },
    uniformsFull: [
      {
        name: "uColor",
        type: "vec3",
        defaultValue: [1.0, 0.0, 0.0],
        description: "The gradient color",
      },
    ],
    inputs: [
      { name: "uv", kind: "uv", description: "UV coordinates", required: true },
    ],
    outputs: [
      { name: "fragColor", kind: "color", description: "Output fragment color" },
    ],
    vertexSource:
      "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentSource: "void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }",
    recipes: {
      three: {
        exportName: "createGradientRadial",
        summary: "Creates a radial gradient ShaderMaterial",
        code: "import * as THREE from 'three';\nexport function createGradientRadial() { return new THREE.ShaderMaterial({}); }",
        placeholders: [],
        requirements: ["three-scene", "mesh"],
      },
      r3f: {
        exportName: "GradientRadial",
        summary: "React Three Fiber component for radial gradient",
        code: "import { shaderMaterial } from '@react-three/drei';\nexport const GradientRadial = shaderMaterial({});",
        placeholders: [],
        requirements: ["react-three-fiber", "drei"],
      },
    },
    provenance: {
      sourceKind: "original",
      sources: [],
      attribution: {
        summary: "Original shader by ShaderBase contributors.",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

runTest("writes shader files for three environment", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "shaderbase-test-"));
  try {
    const bundle = makeMockBundle();
    const paths = writeShaderFiles(bundle, {
      targetDir: tmpDir,
      environment: "three",
    });

    assert.equal(paths.length, 3);

    const shaderDir = join(tmpDir, "gradient-radial");
    assert.ok(existsSync(join(shaderDir, "vertex.glsl")));
    assert.ok(existsSync(join(shaderDir, "fragment.glsl")));
    assert.ok(existsSync(join(shaderDir, "three.ts")));
    assert.ok(!existsSync(join(shaderDir, "r3f.tsx")));

    // Verify content
    const vertex = readFileSync(join(shaderDir, "vertex.glsl"), "utf-8");
    assert.ok(vertex.includes("gl_Position"));
    const fragment = readFileSync(join(shaderDir, "fragment.glsl"), "utf-8");
    assert.ok(fragment.includes("gl_FragColor"));
    const recipe = readFileSync(join(shaderDir, "three.ts"), "utf-8");
    assert.ok(recipe.includes("ShaderMaterial"));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

runTest("writes shader files for r3f environment", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "shaderbase-test-"));
  try {
    const bundle = makeMockBundle();
    const paths = writeShaderFiles(bundle, {
      targetDir: tmpDir,
      environment: "r3f",
    });

    assert.equal(paths.length, 3);

    const shaderDir = join(tmpDir, "gradient-radial");
    assert.ok(existsSync(join(shaderDir, "vertex.glsl")));
    assert.ok(existsSync(join(shaderDir, "fragment.glsl")));
    assert.ok(existsSync(join(shaderDir, "r3f.tsx")));
    assert.ok(!existsSync(join(shaderDir, "three.ts")));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

runTest("writes all recipes when no environment specified", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "shaderbase-test-"));
  try {
    const bundle = makeMockBundle();
    const paths = writeShaderFiles(bundle, { targetDir: tmpDir });

    assert.equal(paths.length, 4);

    const shaderDir = join(tmpDir, "gradient-radial");
    assert.ok(existsSync(join(shaderDir, "vertex.glsl")));
    assert.ok(existsSync(join(shaderDir, "fragment.glsl")));
    assert.ok(existsSync(join(shaderDir, "three.ts")));
    assert.ok(existsSync(join(shaderDir, "r3f.tsx")));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

runTest("writes TSL shader with recipe in subdirectory using relPath", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "shaderbase-test-"));
  try {
    const tslBundle: RegistryShaderBundle = {
      name: "tsl-gradient-wave",
      displayName: "TSL Gradient Wave",
      version: "1.0.0",
      summary: "Animated gradient wave using NodeMaterial",
      tags: ["tsl", "gradient"],
      category: "color",
      pipeline: "surface",
      stage: "fragment",
      environments: ["three"],
      renderers: ["webgpu"],
      sourceKind: "original",
      uniforms: [],
      language: "tsl",
      description: "A TSL shader.",
      author: { name: "ShaderBase" },
      license: "MIT",
      compatibility: {
        three: ">=0.170.0",
        renderers: ["webgpu"],
        material: "node-material",
        environments: ["three"],
      },
      capabilityProfile: {
        pipeline: "surface",
        stage: "fragment",
        requires: [],
        outputs: ["color"],
      },
      uniformsFull: [],
      inputs: [],
      outputs: [{ name: "color", kind: "color", description: "Output color" }],
      tslSource: "export function createMaterial() { /* TSL */ }",
      recipes: {
        three: {
          exportName: "createTslGradientWaveMaterial",
          summary: "Creates a TSL gradient wave material",
          code: "import { createMaterial } from '../source';\nexport function createTslGradientWaveMaterial() { return createMaterial(); }",
          placeholders: [],
          requirements: ["three-scene", "webgpu-renderer"],
          relPath: "recipes/three.ts",
        },
      },
      provenance: {
        sourceKind: "original",
        sources: [],
        attribution: { summary: "Original shader by ShaderBase contributors." },
      },
    };

    const paths = writeShaderFiles(tslBundle, { targetDir: tmpDir, environment: "three" });

    const shaderDir = join(tmpDir, "tsl-gradient-wave");
    // Source file at root
    assert.ok(existsSync(join(shaderDir, "source.ts")));
    // Recipe in subdirectory — preserving import paths
    assert.ok(existsSync(join(shaderDir, "recipes", "three.ts")));
    // Recipe should NOT be at root
    assert.ok(!existsSync(join(shaderDir, "three.ts")));

    // Verify the import path works (../source resolves from recipes/)
    const recipeCode = readFileSync(join(shaderDir, "recipes", "three.ts"), "utf-8");
    assert.ok(recipeCode.includes("from '../source'"));

    assert.equal(paths.length, 2); // source.ts + recipes/three.ts
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

runTest("throws if shader directory already exists", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "shaderbase-test-"));
  try {
    const bundle = makeMockBundle();
    writeShaderFiles(bundle, { targetDir: tmpDir });

    assert.throws(
      () => writeShaderFiles(bundle, { targetDir: tmpDir }),
      /already exists/,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log("add tests passed");
