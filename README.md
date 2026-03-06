# ShaderBase

ShaderBase is an agent-first shader registry for Three.js ecosystems. The repository is designed so an agent can search a shader, inspect its compatibility and provenance, and retrieve an integration recipe without depending on a hosted database.

The north star is simple: git-backed manifests and recipes are the canonical product. Search indexes, SDK APIs, and MCP tools are all derived from what lives here.

## Current Foundation

- Bun workspace with a real `@shaderbase/schema` package
- Versioned shader manifest contract with enforceable provenance, compatibility, capability, and recipe metadata
- Three seed shaders, including sourced examples with explicit upstream attribution
- Solid-powered TanStack Start intake app in `apps/web` that writes validated drafts into `submissions/`
- Repo-level validation script and CI workflow so git stays honest

## Quick Start

```bash
bun install
bun run check
bun run dev:web
```

For GitHub sign-in in the intake app, copy [`.env.example`](C:/Users/Usuario/Documents/Developer/GitHub/shaderbase/apps/web/.env.example) to `apps/web/.env` and configure the GitHub OAuth callback URL as `http://localhost:3000/api/auth/callback/github`.

## Repository Map

- `packages/schema` validates shader manifests and referenced files
- `scripts/validate-shaders.ts` checks every shader entry under `shaders/`
- `shaders/` contains the canonical corpus
- `submissions/` is the website intake queue for draft entries
- `apps/web` is the contributor-facing intake app
- `docs/git-contract.md` captures the source-of-truth rules for the project
- `CONTRIBUTING.md` defines the provenance and attribution bar for new additions

## Product Direction

- Canonical manifests and recipes live in git
- Local-first search and SDK/MCP layers are generated from the corpus
- Human-facing UI is downstream of the agent contract, not the other way around
- Attribution is part of the product contract, not cleanup work after import

The GitHub planning work still matters, but the repo now carries the rationale that future commits need in order to stay aligned.
