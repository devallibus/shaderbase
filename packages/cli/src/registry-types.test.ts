import assert from "node:assert/strict";
import {
  registryIndexEntrySchema,
  registryShaderBundleSchema,
} from "./registry-types.ts";

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
// Fixtures
// ---------------------------------------------------------------------------

function makeValidIndexEntry() {
  return {
    name: "gradient-radial",
    displayName: "Radial Gradient",
    version: "1.0.0",
    summary: "A radial gradient shader",
    tags: ["gradient", "radial"],
    category: "background",
    pipeline: "surface",
    stage: "fragment",
    environments: ["three"],
    renderers: ["webgl2"],
    sourceKind: "original",
    uniforms: [
      { name: "uColor", type: "vec3" },
      { name: "uRadius", type: "float" },
    ],
    language: "glsl",
  };
}

function makeValidShaderBundle() {
  return {
    ...makeValidIndexEntry(),
    language: "glsl" as const,
    description: "A radial gradient shader that renders a smooth circular gradient.",
    author: { name: "ShaderBase" },
    license: "MIT",
    compatibility: {
      three: ">=0.150.0",
      renderers: ["webgl2"],
      material: "shader-material",
      environments: ["three"],
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
      {
        name: "uRadius",
        type: "float",
        defaultValue: 0.5,
        description: "The gradient radius",
        min: 0,
        max: 1,
      },
    ],
    inputs: [
      { name: "uv", kind: "uv", description: "UV coordinates", required: true },
    ],
    outputs: [
      { name: "fragColor", kind: "color", description: "Output fragment color" },
    ],
    vertexSource: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentSource: "void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }",
    recipes: {
      three: {
        exportName: "createGradientRadial",
        summary: "Creates a radial gradient ShaderMaterial",
        code: "import * as THREE from 'three';\nexport function createGradientRadial() { return new THREE.ShaderMaterial({}); }",
        placeholders: [
          {
            name: "COLOR",
            kind: "color",
            description: "The gradient color",
            required: true,
            example: "#ff0000",
          },
        ],
        requirements: ["three-scene", "mesh"],
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

function makeValidTslBundle() {
  return {
    ...makeValidIndexEntry(),
    language: "tsl" as const,
    description: "A TSL noise shader that generates procedural noise.",
    author: { name: "ShaderBase" },
    license: "MIT",
    compatibility: {
      three: ">=0.160.0",
      renderers: ["webgpu"],
      material: "shader-material",
      environments: ["three"],
    },
    capabilityProfile: {
      pipeline: "surface",
      stage: "fragment",
      requires: ["uv"],
      outputs: ["color"],
    },
    uniformsFull: [
      {
        name: "uScale",
        type: "float",
        defaultValue: 1.0,
        description: "Noise scale",
      },
    ],
    inputs: [
      { name: "uv", kind: "uv", description: "UV coordinates", required: true },
    ],
    outputs: [
      { name: "fragColor", kind: "color", description: "Output fragment color" },
    ],
    tslSource: "import { uniform, uv, vec4 } from 'three/tsl';\nexport const noiseMaterial = () => vec4(uv(), 0.0, 1.0);",
    recipes: {
      three: {
        exportName: "createNoiseMaterial",
        summary: "Creates a TSL noise material",
        code: "import { noiseMaterial } from './noise.tsl.ts';\nexport function createNoiseMaterial() { return noiseMaterial(); }",
        placeholders: [],
        requirements: ["three-scene", "mesh"],
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

runTest("validates a valid index entry", () => {
  const entry = makeValidIndexEntry();
  const result = registryIndexEntrySchema.parse(entry);

  assert.equal(result.name, "gradient-radial");
  assert.equal(result.tags.length, 2);
  assert.equal(result.uniforms.length, 2);
  assert.equal(result.environments[0], "three");
});

runTest("rejects index entry without name", () => {
  const entry = makeValidIndexEntry();
  const { name: _, ...withoutName } = entry;
  const result = registryIndexEntrySchema.safeParse(withoutName);

  assert.equal(result.success, false);
});

runTest("validates a valid shader bundle", () => {
  const bundle = makeValidShaderBundle();
  const result = registryShaderBundleSchema.parse(bundle);

  assert.equal(result.name, "gradient-radial");
  assert.equal(result.language, "glsl");
  if (result.language === "glsl") {
    assert.equal(result.vertexSource.length > 0, true);
    assert.equal(result.fragmentSource.length > 0, true);
  }
  assert.equal(Object.keys(result.recipes).length, 1);
  assert.equal(result.provenance.sourceKind, "original");
});

runTest("rejects bundle without vertexSource", () => {
  const bundle = makeValidShaderBundle();
  const { vertexSource: _, ...withoutVertex } = bundle;
  const result = registryShaderBundleSchema.safeParse(withoutVertex);

  assert.equal(result.success, false);
});

runTest("validates a valid TSL shader bundle", () => {
  const bundle = makeValidTslBundle();
  const result = registryShaderBundleSchema.parse(bundle);

  assert.equal(result.name, "gradient-radial");
  assert.equal(result.language, "tsl");
  if (result.language === "tsl") {
    assert.equal(result.tslSource.length > 0, true);
  }
  assert.equal(Object.keys(result.recipes).length, 1);
  assert.equal(result.provenance.sourceKind, "original");
});

runTest("rejects TSL bundle without tslSource", () => {
  const bundle = makeValidTslBundle();
  const { tslSource: _, ...withoutTsl } = bundle;
  const result = registryShaderBundleSchema.safeParse(withoutTsl);

  assert.equal(result.success, false);
});

runTest("rejects index entry with empty tags", () => {
  const entry = makeValidIndexEntry();
  entry.tags = [];
  const result = registryIndexEntrySchema.safeParse(entry);

  assert.equal(result.success, false);
});

console.log("registry-types tests passed");
