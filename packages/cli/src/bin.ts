import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { searchShaders } from "./commands/search.ts";
import { writeShaderFiles } from "./commands/add.ts";
import { fetchIndex, fetchShaderBundle } from "./lib/registry-client.ts";

// ---------------------------------------------------------------------------
// Usage help
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`shaderbase — shader registry CLI

Commands:
  search   Search the shader registry
  add      Add a shader to your project

Examples:
  shaderbase search --query noise
  shaderbase search --category post-processing --pipeline fragment-only
  shaderbase search --tag animated --tag noise --json
  shaderbase add perlin-noise
  shaderbase add perlin-noise --env three --dir src/shaders`);
}

// ---------------------------------------------------------------------------
// search command
// ---------------------------------------------------------------------------

async function runSearch(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      query: { type: "string", short: "q" },
      category: { type: "string", short: "c" },
      pipeline: { type: "string", short: "p" },
      environment: { type: "string", short: "e" },
      tag: { type: "string", short: "t", multiple: true },
      json: { type: "boolean", default: false },
    },
    strict: false,
  });

  const index = await fetchIndex();
  const results = searchShaders(index, {
    query: values.query as string | undefined,
    category: values.category as string | undefined,
    pipeline: values.pipeline as string | undefined,
    environment: values.environment as string | undefined,
    tags: values.tag as string[] | undefined,
  });

  if (results.length === 0) {
    console.log("No shaders found.");
    return;
  }

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const shader of results) {
    console.log(`${shader.name} — ${shader.summary}`);
    console.log(
      `  category: ${shader.category} | pipeline: ${shader.pipeline} | tags: ${shader.tags.join(", ")}`,
    );
  }
}

// ---------------------------------------------------------------------------
// add command
// ---------------------------------------------------------------------------

async function runAdd(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      env: { type: "string", short: "e" },
      dir: { type: "string", short: "d", default: "src/shaders" },
    },
    strict: false,
    allowPositionals: true,
  });

  const name = positionals[0];
  if (!name) {
    console.error("Error: shader name is required.\nUsage: shaderbase add <name>");
    process.exit(1);
  }

  const targetDir = resolve(values.dir as string);
  const bundle = await fetchShaderBundle(name);
  const written = writeShaderFiles(bundle, {
    targetDir,
    environment: values.env as "three" | "r3f" | undefined,
  });

  console.log(`Added ${name} to ${targetDir}/${name}/`);
  for (const filePath of written) {
    console.log(`  ${filePath}`);
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "search":
      await runSearch(args.slice(1));
      break;
    case "add":
      await runAdd(args.slice(1));
      break;
    default:
      printUsage();
      break;
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
