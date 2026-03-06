# Git Contract

ShaderBase treats the repository as the only authoritative place to define what a shader is, how it is used, and whether it is safe to ship.

## Canonical Artifacts

- `shader.json` manifests
- GLSL source files
- Integration recipes
- Preview assets
- Validation code and tests

If an agent or package needs extra metadata, that metadata should be added to the manifest schema and committed here.

## Derived Artifacts

- Search indexes
- SDK lookup tables
- MCP responses
- Generated docs and galleries

Derived artifacts may be cached or published elsewhere, but they are disposable. They must always be rebuildable from git.

## Change Discipline

- Every shader must carry explicit provenance and license information.
- Adapted and ported shaders must carry exact upstream URLs, revision markers, author names, and a required downstream notice.
- Every referenced file in a manifest must exist in the same shader directory tree.
- Capability and compatibility metadata should describe runtime reality, not marketing language.
- A change that affects retrieval behavior should come with either a manifest update, a schema update, or a validation update.

## Quality Gates

- `bun test` protects the schema contract.
- `bun run validate:shaders` protects the corpus contract.
- CI runs both checks on every push to `master` and every pull request.

## Working Principle

When product pressure and repository truth disagree, repository truth wins. If a feature cannot be explained or reconstructed from git, the project is drifting.
