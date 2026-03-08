# Contributing

ShaderBase accepts new shaders only when provenance is explicit and reproducible from git.

## Non-Negotiable Rules

- Do not submit shaders with unclear licensing.
- Do not submit shaders copied from galleries, tweets, videos, or demos unless you can point to the exact source artifact and license.
- If a shader is adapted or ported, the manifest must include exact upstream links, revision markers, license, authors, and a required attribution notice.
- If a shader is original, say so explicitly in `provenance.sourceKind` and keep the attribution summary honest.

## Submission Checklist

When submitting via pull request, use the [shader submission PR template](.github/PULL_REQUEST_TEMPLATE/shader_submission.md) — it guides you through all required fields.

For every shader entry under `shaders/<name>/`:

- Add `shader.json` with valid schema metadata.
- Add GLSL source files and every file referenced by the manifest.
- Add preview artwork.
- Add at least one integration recipe.
- Fill out `provenance` completely.

For adapted or ported shaders, `provenance.sources[]` must include:

- Exact upstream file or repository URL
- Repository URL when the source points to a file
- Revision or snapshot marker
- Retrieval date in `YYYY-MM-DD`
- License identifier or license label
- Author list
- Required downstream attribution notice

## Attribution Standard

Every adapted or ported shader must answer all of these questions from the manifest alone:

- Where did this code come from?
- Which upstream artifact was used?
- Which revision or snapshot was reviewed?
- Under which license can we redistribute it?
- Which names must remain credited?
- What notice should downstream consumers preserve?

If you cannot answer all six, the shader is not ready to merge.

## Validation

Run:

```bash
bun run check
```

That covers schema tests, type checks, and manifest validation.
