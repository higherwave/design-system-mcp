@AGENTS.md

# design-system-mcp: working notes

This repo is the kit: brand-neutral code that governs a Carbon-based design system for Claude Code. The brand is data in `registry/`.
`README.md` has the layout and settings.

## Rules

- `lib/validateRules.ts` has **no imports** on purpose: apps pin a copy of it (`npm run rules:sync` in the app). Keep it that way, and
  keep every rule deterministic (same code in, same result out).
- A new or changed rule needs a test in `test/validate.test.ts`, and every pattern snippet in `registry/patterns/` must still pass.
- Changing `registry/tokens.json`? The app's `theme.scss` must agree: CI checks it against the app named by the repository variable
  `APP_REPO` (`node scripts/check-tokens.mjs <theme.scss> [tokens.json]` locally). Where the app deliberately differs from the
  prototype, keep the prototype's value as an `"exact": false` entry with a note.
- Nothing company-specific goes into `lib/` or `app/`: the GitHub repo comes from settings (`lib/repoSettings.ts`), the brand from
  `registry/`.

## Before you push

    npm test && npx tsc --noEmit && npm run build

Every push to `main` deploys. After merging a rule change, run `npm run rules:sync` in each app that pins the rules and commit the result.
