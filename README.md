# design-system-mcp

An MCP server that governs a Carbon-based design system for Claude Code: which components are allowed, the design tokens,
registered page patterns, and a validator that checks generated pages against the rules. It is brand-neutral code; the brand
lives in `registry/` (data), so a company forks this repo and replaces that data.

## What is where

| Path | What |
| --- | --- |
| `registry/components.json` | The allowlist of Carbon components, and the raw HTML elements the validator forbids |
| `registry/tokens.json` | The design tokens (colors, type, spacing) as data the server can answer questions about |
| `registry/patterns/*.json` | Registered page patterns, each with a snippet that must pass the validator |
| `lib/validateRules.ts` | The validator (`validatePage`). Self-contained: no imports, so apps can copy it (see below) |
| `app/api/mcp/route.ts` | The MCP endpoint (bearer-token protected) with its tools |
| `lib/githubWrite.ts`, `lib/repoSettings.ts` | `register_pattern`: opens a pull request that adds a pattern file |
| `scripts/check-tokens.mjs` | Checks `tokens.json` against an app's `theme.scss`: `node scripts/check-tokens.mjs <theme.scss> [tokens.json]` |

## Settings (Vercel environment variables)

| Name | Purpose |
| --- | --- |
| `MCP_SHARED_TOKEN` | The bearer token Claude Code sends. Treat it like a password |
| `GITHUB_TOKEN` | A fine-grained token limited to this one repo (contents and pull requests: write), used by `register_pattern` |
| `GITHUB_OWNER`, `GITHUB_REPO` | Optional. Which repo `register_pattern` writes to. Both or neither. If unset, the repository Vercel built from is used, then the `repository` URL in `package.json`, so a fork needs no code change |

## Using the validator from an app

An app does not need a checkout of this repo. It keeps a pinned copy of `lib/validateRules.ts` and `registry/components.json`
under `vendor/design-rules/` (with `registry/tokens.json` and `scripts/check-tokens.mjs`, so the token drift check runs there too) and refreshes it with its `rules:sync` script (see the app's README). To publish a new rule, merge
it here, then run `rules:sync` in each app and commit the result.

## Commands

    npm run dev            # MCP server on :3000
    npm test               # registry and validator tests
    npm run check:tokens   # compare tokens.json with an app's theme.scss
