# ShaderBase Agent Notes

ShaderBase treats git as the product boundary. If a decision matters, it belongs in the repository as code, docs, tests, or manifests.

## Canonical Sources

- `shaders/*/shader.json` is the source of truth for shader metadata.
- `shaders/*/*.glsl` and `shaders/*/recipes/*` are the source of truth for integration behavior.
- Generated registry JSON, CLI, and MCP responses are derived artifacts and must be reproducible from the repository.

## Commands

- `bun install`
- `bun test` — runs all tests (schema, CLI, MCP, registry build)
- `bun run validate:shaders`
- `bun run check` — test + typecheck + validate + build
- `bun run build:registry` — generates `dist/registry/` from `shaders/*/`
- `bun run dev:web` — web app dev server on :3000

## Packages

- `packages/schema` — Zod manifest validation
- `packages/cli` — CLI (`shaderbase` on npm): search + add commands
- `packages/mcp` — MCP server (Cloudflare Worker): search_shaders + get_shader tools

## Distribution Model

shadcn-style: the CLI copies shader source files into the user's project. No npm dependency per shader. The user owns the code.

## Editing Rules

- Preserve provenance and license metadata on every shader.
- For adapted or ported shaders, record exact upstream links, revision markers, author names, and downstream notice text.
- Keep recipes agent-friendly: copy-paste ready, explicit inputs, explicit customization points.
- Prefer additive changes to the manifest schema so old corpus entries remain readable.
- If a search, CLI, or MCP feature needs data that is not in the manifest, extend the manifest instead of hard-coding it elsewhere.
