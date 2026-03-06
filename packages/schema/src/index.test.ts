import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shaderManifestSchema, validateShaderManifestFile } from "./index.ts";

const fixtureManifestPath = fileURLToPath(
  new URL("../../../shaders/gradient-radial/shader.json", import.meta.url),
);
const sourcedFixtureManifestPath = fileURLToPath(
  new URL("../../../shaders/vignette-postprocess/shader.json", import.meta.url),
);

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

runTest("validates the seed shader manifest", () => {
  const manifest = validateShaderManifestFile(fixtureManifestPath);

  assert.equal(manifest.name, "gradient-radial");
  assert.equal(manifest.recipes.length, 2);
  assert.ok(manifest.compatibility.environments.includes("three"));
});

runTest("validates an adapted upstream shader manifest", () => {
  const manifest = validateShaderManifestFile(sourcedFixtureManifestPath);

  assert.equal(manifest.name, "vignette-postprocess");
  assert.equal(manifest.provenance.sourceKind, "adapted");
  assert.equal(manifest.provenance.sources.length, 1);
  assert.equal(
    manifest.provenance.attribution.requiredNotice,
    "Includes adapted code from the Three.js authors under the MIT License.",
  );
});

runTest("rejects invalid uniform defaults", () => {
  const manifest = JSON.parse(readFileSync(fixtureManifestPath, "utf8")) as Record<string, unknown>;
  const uniforms = manifest.uniforms as Array<Record<string, unknown>>;

  uniforms[3]!.defaultValue = [0.5];

  const result = shaderManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

runTest("rejects adapted manifests without exact provenance", () => {
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

runTest("rejects missing referenced files", () => {
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

console.log("schema tests passed");
