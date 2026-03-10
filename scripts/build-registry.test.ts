import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "./build-registry.ts";

const shadersRoot = fileURLToPath(new URL("../shaders", import.meta.url));

function runTest(name: string, callback: () => void) {
  try {
    callback();
    console.log(`ok ${name}`);
  } catch (error) {
    console.error(`not ok ${name}`);
    throw error;
  }
}

// --- Test: builds registry from shader corpus ---

const tempDir = mkdtempSync(join(tmpdir(), "shaderbase-registry-"));

try {
  await buildRegistry({ shadersRoot, outputDir: tempDir });

  runTest("index.json exists and has correct version", () => {
    const indexPath = join(tempDir, "index.json");
    assert.ok(existsSync(indexPath), "index.json should exist");

    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    assert.equal(index.version, "0.2.0");
    assert.ok(index.shaders.length >= 4, `expected at least 4 shaders, got ${index.shaders.length}`);
  });

  runTest("per-shader bundle files exist", () => {
    const bundlePath = join(tempDir, "shaders", "gradient-radial.json");
    assert.ok(existsSync(bundlePath), "gradient-radial.json bundle should exist");

    const vignettePath = join(tempDir, "shaders", "vignette-postprocess.json");
    assert.ok(existsSync(vignettePath), "vignette-postprocess.json bundle should exist");

    const simplexPath = join(tempDir, "shaders", "simplex-displacement.json");
    assert.ok(existsSync(simplexPath), "simplex-displacement.json bundle should exist");
  });

  runTest("bundle has vertexSource with GLSL content", () => {
    const bundle = JSON.parse(
      readFileSync(join(tempDir, "shaders", "gradient-radial.json"), "utf8"),
    );
    assert.ok(bundle.vertexSource.includes("gl_Position"), "vertexSource should contain gl_Position");
    assert.ok(bundle.vertexSource.includes("vUv"), "vertexSource should contain vUv");
  });

  runTest("bundle has fragmentSource with GLSL content", () => {
    const bundle = JSON.parse(
      readFileSync(join(tempDir, "shaders", "gradient-radial.json"), "utf8"),
    );
    assert.ok(bundle.fragmentSource.includes("gl_FragColor"), "fragmentSource should contain gl_FragColor");
    assert.ok(bundle.fragmentSource.includes("uInnerColor"), "fragmentSource should contain uInnerColor");
  });

  runTest("bundle has recipes.three with code containing the export function", () => {
    const bundle = JSON.parse(
      readFileSync(join(tempDir, "shaders", "gradient-radial.json"), "utf8"),
    );
    assert.ok(bundle.recipes.three, "recipes.three should exist");
    assert.ok(
      bundle.recipes.three.code.includes("createGradientRadialMaterial"),
      "three recipe code should contain createGradientRadialMaterial",
    );
  });

  runTest("index entries have uniform summaries with name and type", () => {
    const index = JSON.parse(readFileSync(join(tempDir, "index.json"), "utf8"));
    const gradientEntry = index.shaders.find(
      (s: { name: string }) => s.name === "gradient-radial",
    );
    assert.ok(gradientEntry, "gradient-radial should be in the index");
    assert.ok(gradientEntry.uniforms.length > 0, "should have at least one uniform");

    const firstUniform = gradientEntry.uniforms[0];
    assert.ok(firstUniform.name, "uniform should have a name");
    assert.ok(firstUniform.type, "uniform should have a type");
  });

  runTest("index entries include language field", () => {
    const index = JSON.parse(readFileSync(join(tempDir, "index.json"), "utf8"));
    for (const shader of index.shaders) {
      assert.ok(shader.language, `shader ${shader.name} should have a language field`);
      assert.ok(
        shader.language === "glsl" || shader.language === "tsl",
        `shader ${shader.name} should be glsl or tsl`,
      );
    }
  });

  runTest("TSL shader bundle has tslSource", () => {
    const bundlePath = join(tempDir, "shaders", "tsl-gradient-wave.json");
    assert.ok(existsSync(bundlePath), "tsl-gradient-wave.json bundle should exist");
    const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
    assert.equal(bundle.language, "tsl");
    assert.ok(bundle.tslSource.includes("createMaterial"), "tslSource should contain createMaterial");
    assert.ok(bundle.previewModule.includes("createPreview"), "previewModule should contain createPreview");
    assert.equal(bundle.vertexSource, undefined, "TSL bundles should not have vertexSource");
  });

  runTest("SVG previews are inlined into shader bundles", () => {
    const bundle = JSON.parse(
      readFileSync(join(tempDir, "shaders", "tsl-gradient-wave.json"), "utf8"),
    );
    assert.ok(bundle.previewSvg, "TSL bundle should include previewSvg");
    assert.ok(bundle.previewSvg.includes("<svg"), "previewSvg should contain SVG markup");
  });

  runTest("index entries are sorted alphabetically by name", () => {
    const index = JSON.parse(readFileSync(join(tempDir, "index.json"), "utf8"));
    const names = index.shaders.map((s: { name: string }) => s.name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    assert.deepEqual(names, sorted, "index entries should be sorted alphabetically");
  });

  console.log("build-registry tests passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
