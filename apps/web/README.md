# ShaderBase Web Intake

This Solid TanStack Start app is the contributor-facing intake surface for ShaderBase.

## What It Does

- Shows the current canonical shader library
- Shows draft submissions waiting in `../../submissions/`
- Lets a contributor build a shader entry through structured form controls
- Validates the generated artifact against the canonical schema before saving

## What It Does Not Do

- It does not write directly into `../../shaders/`
- It does not bypass provenance requirements
- It does not replace normal git review

## Local Commands

```bash
bun run dev
bun run build
```

## Auth Setup

1. Copy `.env.example` to `.env`.
2. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`.
3. Create a GitHub OAuth app and use this callback URL:

```text
http://localhost:3000/api/auth/callback/github
```

4. Put the GitHub client ID and secret into `.env`.

The recommended repo-level entrypoint is still:

```bash
bun run dev:web
```
