import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shaderManifestSchema, validateShaderManifestFile } from "./index.ts";
import { buildTslPreviewModule } from "./tsl-preview-module.ts";

const fixtureManifestPath = fileURLToPath(
  new URL("../../../shaders/gradient-radial/shader.json", import.meta.url),
);
const sourcedFixtureManifestPath = fileURLToPath(
  new URL("../../../shaders/vignette-postprocess/shader.json", import.meta.url),
);

function runTest(name: string, callback: () => void | Promise<void>) {
  const result = callback();
  if (result instanceof Promise) {
    return result.then(
      () => console.log(`ok ${name}`),
      (error) => {
        console.error(`not ok ${name}`);
        throw error;
      },
    );
  }

  console.log(`ok ${name}`);
}

await runTest("validates the seed shader manifest", () => {
  const manifest = validateShaderManifestFile(fixtureManifestPath);

  assert.equal(manifest.name, "gradient-radial");
  assert.equal(manifest.recipes.length, 2);
  assert.ok(manifest.compatibility.environments.includes("three"));
});

await runTest("validates an adapted upstream shader manifest", () => {
  const manifest = validateShaderManifestFile(sourcedFixtureManifestPath);

  assert.equal(manifest.name, "vignette-postprocess");
  assert.equal(manifest.provenance.sourceKind, "adapted");
  assert.equal(manifest.provenance.sources.length, 1);
  assert.equal(
    manifest.provenance.attribution.requiredNotice,
    "Includes adapted code from the Three.js authors under the MIT License.",
  );
});

await runTest("rejects invalid uniform defaults", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;
  const uniforms = manifest.uniforms as Array<Record<string, unknown>>;

  uniforms[3]!.defaultValue = [0.5];

  const result = shaderManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

await runTest("rejects adapted manifests without exact provenance", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;

  manifest.provenance = {
    attribution: {
      summary: "Adapted from somewhere on the internet.",
    },
    sourceKind: "adapted",
    sources: [],
  };

  const result = shaderManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

await runTest("rejects missing referenced files", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "shaderbase-schema-"));
  const shaderDirectory = join(tempDirectory, "gradient-radial");
  const recipeDirectory = join(shaderDirectory, "recipes");
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;

  mkdirSync(recipeDirectory, { recursive: true });
  writeFileSync(join(shaderDirectory, "shader.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(
    join(shaderDirectory, "vertex.glsl"),
    readFileSync(join(dirname(fixtureManifestPath), "vertex.glsl"), "utf8"),
  );
  writeFileSync(
    join(shaderDirectory, "fragment.glsl"),
    readFileSync(join(dirname(fixtureManifestPath), "fragment.glsl"), "utf8"),
  );
  writeFileSync(
    join(shaderDirectory, "preview.svg"),
    readFileSync(join(dirname(fixtureManifestPath), "preview.svg"), "utf8"),
  );
  writeFileSync(
    join(recipeDirectory, "three.ts"),
    readFileSync(join(dirname(fixtureManifestPath), "recipes", "three.ts"), "utf8"),
  );

  try {
    assert.throws(
      () => validateShaderManifestFile(join(shaderDirectory, "shader.json")),
      /Referenced file does not exist: recipes\/r3f\.tsx/,
    );
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
});

await runTest("defaults language to glsl when missing", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;
  delete manifest.language;

  const result = shaderManifestSchema.safeParse(manifest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.language, "glsl");
  }
});

await runTest("validates a TSL manifest", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;
  manifest.language = "tsl";
  manifest.tslEntry = "source.ts";
  manifest.compatibility = {
    ...(manifest.compatibility as Record<string, unknown>),
    renderers: ["webgpu"],
    material: "node-material",
  };
  delete manifest.files;

  const result = shaderManifestSchema.safeParse(manifest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.language, "tsl");
  }
});

await runTest("rejects TSL manifest without tslEntry", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;
  manifest.language = "tsl";
  delete manifest.files;

  const result = shaderManifestSchema.safeParse(manifest);
  assert.equal(result.success, false);
});

await runTest("buildTslPreviewModule binds runtime imports inside createPreview", async () => {
  const previewModule = buildTslPreviewModule(`
import { color } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export function createMaterial(runtime) {
  const material = new NodeMaterial();
  material.colorNode = color(runtime.uniforms.tint);
  return material;
}
`);

  const module = await import(`data:text/javascript,${encodeURIComponent(previewModule)}`);

  class FakeNodeMaterial {
    colorNode?: number;
  }

  const preview = module.createPreview({
    THREE: { NodeMaterial: FakeNodeMaterial },
    TSL: { color: (value: number) => value },
    width: 512,
    height: 512,
    pipeline: "surface",
    uniforms: { tint: 0xff0000 },
  });

  assert.ok(preview.material instanceof FakeNodeMaterial);
  assert.equal((preview.material as FakeNodeMaterial).colorNode, 0xff0000);
});

console.log("schema tests passed");
