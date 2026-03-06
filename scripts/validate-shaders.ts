import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateShaderManifestFile } from "../packages/schema/src/index.ts";

const shadersRoot = resolve(process.cwd(), "shaders");

const manifestPaths = existsSync(shadersRoot)
  ? readdirSync(shadersRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(shadersRoot, entry.name, "shader.json"))
      .filter((candidate) => existsSync(candidate))
  : [];

if (manifestPaths.length === 0) {
  console.error("No shader manifests found under shaders/.");
  process.exit(1);
}

let failureCount = 0;

for (const manifestPath of manifestPaths) {
  try {
    const manifest = validateShaderManifestFile(manifestPath);
    console.log(`validated ${manifest.name}`);
  } catch (error) {
    failureCount += 1;
    console.error(`failed ${manifestPath}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failureCount > 0) {
  process.exit(1);
}

console.log(`Validated ${manifestPaths.length} shader manifest(s).`);
