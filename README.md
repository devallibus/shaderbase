# ShaderBase

ShaderBase is an agent-first shader registry for Three.js ecosystems. Git-backed manifests and recipes are the canonical product. Search indexes, CLI tools, and MCP servers are derived artifacts.

## Architecture

```
shaders/              Canonical shader corpus (source of truth)
packages/
  schema/             Zod-based manifest validation
  cli/                CLI: npx @shaderbase/cli search/add (shadcn-style)
  mcp/                MCP server for AI agent integration (Cloudflare Worker)
scripts/
  build-registry.ts   Generates static registry JSON from corpus
  validate-shaders.ts Validates all shader manifests
apps/web/             SolidJS web app (browse, search, detail pages)
```

### How it works

1. **Shaders live in git** — each shader has `shader.json`, GLSL source, and integration recipes
2. **CI builds the registry** — static JSON index + per-shader bundles deployed to CDN
3. **Agents use MCP** — `search_shaders` and `get_shader` tools via remote MCP server
4. **Humans use the CLI** — `npx @shaderbase/cli add gradient-radial --env r3f`
5. **Files are copied into your project** (shadcn-style) — you own the code

## Quick Start

```bash
bun install
bun run check        # test + typecheck + validate + build
bun run dev:web      # dev server on :3000
bun run build:registry  # generate dist/registry/
```

## Using ShaderBase

### CLI

```bash
# Search for shaders
npx @shaderbase/cli search --query "gradient"
npx @shaderbase/cli search --pipeline postprocessing --env r3f

# Add a shader to your project
npx @shaderbase/cli add gradient-radial --env r3f
npx @shaderbase/cli add gradient-radial --env three --dir src/shaders

# Submit a shader (creates a GitHub PR via AI analysis)
npx @shaderbase/cli submit "void main() { gl_FragColor = vec4(1.0); }"
npx @shaderbase/cli submit https://www.shadertoy.com/view/XsXXDn
```

### MCP (for AI agents)

Add to your Claude config:
```json
{
  "mcpServers": {
    "shaderbase": {
      "url": "https://mcp.shaderbase.com/mcp"
    }
  }
}
```

Tools: `search_shaders`, `get_shader`, and `submit_shader`

## Repository Map

| Path | Purpose |
|------|---------|
| `shaders/` | Canonical shader corpus |
| `packages/schema/` | Zod manifest validation + types |
| `packages/cli/` | CLI package (`shaderbase` on npm) |
| `packages/mcp/` | MCP server (Cloudflare Worker) |
| `scripts/` | Build and validation scripts |
| `apps/web/` | Web app (browse, search, detail pages) |
| `docs/` | Git contract, plans |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the provenance bar and submission checklist.

Submissions can be made via:
- The CLI: `npx @shaderbase/cli submit <glsl-or-url>` (AI parses your GLSL, creates a PR)
- The MCP `submit_shader` tool (for AI agents)
- Direct pull request to the `shaders/` directory
