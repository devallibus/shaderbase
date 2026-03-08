# ShaderBase

A shader registry for Three.js — browse, search, and add production-ready GLSL shaders to your project. Like [shadcn/ui](https://ui.shadcn.com), but for shaders: the CLI copies source files into your codebase. You own the code.

**[shaderbase.com](https://shaderbase.com)** · **[MCP server](https://mcp.shaderbase.com/mcp)**

## Usage

### CLI

```bash
# Search for shaders
npx @shaderbase/cli search --query "gradient"
npx @shaderbase/cli search --pipeline postprocessing --env r3f

# Add a shader to your project (copies files, you own them)
npx @shaderbase/cli add gradient-radial --env r3f
npx @shaderbase/cli add gradient-radial --env three --dir src/shaders

# Submit a shader (AI parses your GLSL, creates a GitHub PR)
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

Tools: `search_shaders`, `get_shader`, `submit_shader`

## How it works

1. **Shaders live in git** — each has a `shader.json` manifest, GLSL source, and integration recipes
2. **CI builds the registry** — static JSON deployed to CDN
3. **Agents use MCP** — remote server with search and retrieval tools
4. **Humans use the CLI** — `npx @shaderbase/cli add <shader> --env r3f`
5. **Files are copied into your project** — no runtime dependency, you own the code

## Development

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Node.js](https://nodejs.org) v22+

### Setup

```bash
bun install
bun run dev:web          # dev server on :3000
bun run check            # test + typecheck + validate + build
bun run build:registry   # generate dist/registry/
bun run test             # run all tests
bun run validate:shaders # validate shader manifests
```

### Project structure

```
shaders/            Shader corpus (source of truth)
packages/
  schema/           Zod manifest validation + types
  cli/              CLI: search, add, submit (@shaderbase/cli on npm)
  mcp/              MCP server (Cloudflare Worker)
apps/web/           SolidJS web app (browse, search, detail pages)
scripts/            Registry build + shader validation
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for provenance rules and the submission checklist.

Submissions can be made via:
- **CLI**: `npx @shaderbase/cli submit <glsl-or-url>`
- **MCP**: `submit_shader` tool
- **Pull request**: directly to `shaders/`

## License

[MIT](LICENSE)
