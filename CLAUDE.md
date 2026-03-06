# ShaderBase Agent Notes

ShaderBase treats git as the product boundary. If a decision matters, it belongs in the repository as code, docs, tests, or manifests.

## Canonical Sources

- `shaders/*/shader.json` is the source of truth for shader metadata.
- `shaders/*/*.glsl` and `shaders/*/recipes/*` are the source of truth for integration behavior.
- Generated indexes, SDK helpers, and MCP responses are derived artifacts and must be reproducible from the repository.

## Commands

- `bun install`
- `bun test`
- `bun run validate:shaders`
- `bun run check`

## Editing Rules

- Preserve provenance and license metadata on every shader.
- For adapted or ported shaders, record exact upstream links, revision markers, author names, and downstream notice text.
- Keep recipes agent-friendly: copy-paste ready, explicit inputs, explicit customization points.
- Prefer additive changes to the manifest schema so old corpus entries remain readable.
- If a search, SDK, or MCP feature needs data that is not in the manifest, extend the manifest instead of hard-coding it elsewhere.
