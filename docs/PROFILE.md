# The design-system profile

A profile says which design system governs a product, and the rules engine reads everything about that system from it. Nothing about
Carbon, the Airtable layer or any one company is built into the engine. A company adopting this pipeline writes its own profile; the
engine, the MCP tools and the checks do not change.

## What is in a registry

| File | Says | Owned by |
| --- | --- | --- |
| `profile.json` | Which design system: its library package, token prefix and type mixin; the components a product restricts; the rules it switches off | The design owner |
| `components.json` | The components the library offers and a product may use (with usage notes), and the HTML elements that must come from a component | The design owner |
| `tokens.json` | The tokens: colours, spacing, radius, type roles, layers, rings, the readable colour pairs | The design owner |
| `patterns/` | Pages already built, found by search before generating a new one | Anyone, through a pull request |

## `profile.json`

    {
      "profile": 1,
      "name": "Carbon with the Airtable layer (Signal Flow)",
      "library": { "package": "@carbon/react", "icons": "@carbon/icons-react" },
      "tokens":  { "prefix": "--at-", "typeMixin": "role", "section": "airtable" },
      "components": { "restricted": [] },
      "rules": {}
    }

- **library.package**: the one package components are imported from. Imports are checked against `components.json`; namespace, default and
  deep imports are refused because they would skip that check.
- **tokens.prefix**: every token starts with it (`--at-`). The token check, the contrast check and the messages use it.
- **tokens.typeMixin**: the Sass mixin that applies a type role (`role('body-md')`). The linter checks the role exists.
- **tokens.section**: the key in `tokens.json` that holds this system's tokens.
- **components.restricted**: components that exist in the library but the product does not use. Each has a `name`, a `reason` and what to
  use `instead`. Importing one fails with the reason, so the person or the AI is told why and what to do, not just "no".
- **rules**: `{ "rule-name": "off" }` switches a rule off for every product on this profile. Use it sparingly: it is a governance decision.

## Governance: who can change what

1. **The design owner** (the company) owns the profile, the component list and the tokens. A change is a pull request to the registry.
2. **A product** may restrict more components in its own `design-rules.config.json` (`{ "restricted": [...] }`). It cannot allow what the
   company restricts and cannot switch a rule off. Restrictions it adds are listed in the file with their reasons, so they are visible.
3. **The checks keep it honest**: `check:tokens` (the stylesheet and the registry agree, no token defined twice, no unregistered colour),
   `check:contrast` (the colour pairs are readable), the linter (pages follow the rules), and tests that the type roles in the registry are
   the roles the mixin has.

## Adopting a new design system

1. Copy the `registry/` folder and edit `profile.json`: your package, your token prefix and mixin name, your tokens section.
2. List your components in `components.json` (names, import, notes) and the raw elements that must be components.
3. Describe your tokens in `tokens.json` under your section: `type.roles`, `layer`, `color`, `contrast` pairs.
4. Run `npm test` here, then `npm run check:tokens` and `npm run check:contrast` against your product's stylesheet.
5. In the product, `npm run rules:sync` copies the profile and rules in; `npm run validate:pages` enforces them.

`test/profile.test.ts` runs a made-up second design system (`@acme/ui`, prefix `--acme-`, mixin `type`) through the same engine and
scripts, as the proof that nothing is built in.

## What is still specific to this design system

Two of the rules assume a shape, not a name: the token rules look for `px`, `rem`, hex colours and `var()` references, and the
type rule assumes type is applied by a Sass mixin with a quoted role name. A design system that applies type another way (CSS custom
properties, a utility class) would need its rule changed, switched off in the profile, or a second rule written. Everything else is data.
