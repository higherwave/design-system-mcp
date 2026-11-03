export type Violation = {
  rule: string
  message: string
  /** First few 1-based line numbers where the rule matched (comments are ignored). */
  lines?: number[]
}

// ---------------------------------------------------------------------------------------------
// Rules for pages generated from a Design Component prototype (inline styles, raw hex, px) into
// a design system. Which design system (its component package, token prefix, type mixin, forbidden elements, restricted components)
// is a profile, not code: see registry/profile.json and optionsFromProfile below. Every rule is deterministic: same code in, same result out.
// Known limits are noted next to each pattern; the validator is a guard, not a parser.
// ---------------------------------------------------------------------------------------------

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
// rgb(), rgba(), hsl(), hsla() evade the hex rule, so they are checked too.
const COLOR_FUNCTION_RE = /\b(?:rgba?|hsla?)\(/g
// No `i` flag: JSX component names are capitalized (<Button>), raw HTML
// elements are lowercase (<button>) — case must distinguish them.
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const DEFAULT_RAW_ELEMENTS = ['button', 'input', 'select', 'textarea', 'table']
const rawElementRe = (elements: string[]) => new RegExp(`<(${elements.map(escapeRe).join('|')})[\\s>]`, 'g')
const IMG_RE = /<img[\s>][^>]*>/g
// JSX style={...} and HTML style="..." / style='...'. `style-hover=` does not match: `\bstyle` is
// followed by `-`, not `=`.
const INLINE_STYLE_RE = /\bstyle\s*=\s*[{"']/g
// Raw px lengths. 0 and 1px hairlines are allowed (borders); everything else should be a token or rem.
const PX_RE = /(?<![\w.#$-])(\d+(?:\.\d+)?)px\b/g
// Markup that means the code is still a Design Component prototype, not React. A `{{` right after `=`
// is ordinary JSX (`style={{ ... }}`) and is left to the inline-style rule; a prototype binding is
// quoted (`="{{ go }}"`) or sits in text (`>{{ label }}<`).
const DC_MARKUP_RE = /<\/?sc-(?:if|for)\b|\bstyle-(?:hover|active)\s*=|(?<!=)\{\{[^}]*\}\}/g
// A non-interactive element made clickable. Limit: an `onClick` that comes after an arrow
// function's `=>` inside the same tag is not seen.
const CLICKABLE_NON_INTERACTIVE_RE = /<(?:div|span|li|td|p)\b[^>]*\bonClick\s*=/g

// Blank out // and /* */ comments (keeping line breaks) so a comment that mentions "16px" or
// "#fff" cannot fail a page. The `[^:'"`]` guard keeps URLs such as https://x intact.
export function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (_m, pre: string) => pre)
}

function matchesWithLines(code: string, re: RegExp): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  for (const m of code.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) {
    out.push({ text: m[0], line: code.slice(0, m.index ?? 0).split('\n').length })
  }
  return out
}

const linesOf = (hits: { line: number }[]) => [...new Set(hits.map((h) => h.line))].slice(0, 5)

export type ValidateOptions = {
  /** Component names allowed from '@carbon/react' (registry/components.json). Omit to skip the import check. */
  allowedComponents?: string[]
  /** Type role names (registry/tokens.json airtable.type.roles). Omit to skip the role() check. */
  typeRoles?: string[]
  /** The component library's package, for the import rules. Default '@carbon/react'; another design system names its own. */
  importFrom?: string
  /** The design system's token prefix, for the messages. Default '--at-'. */
  tokenPrefix?: string
  /** The Sass mixin that applies a type role: role('body-md'). Default 'role'. */
  typeMixin?: string
  /** HTML elements that must come from a component instead. Default button, input, select, textarea, table. */
  rawElements?: string[]
  /** Components that exist in the library but this product has chosen not to use, each with the reason and what to use instead. */
  restrictedComponents?: { name: string; reason: string; instead?: string }[]
  /** Layer token names, for the z-index message. */
  layerTokens?: string[]
  /** A name for the design system, for the messages. */
  designSystem?: string
  /** Rules a profile switches off. Everything else is on. */
  rules?: Record<string, 'off' | 'error'>
}

/** What a design-system profile declares (registry/profile.json). */
export type Profile = {
  name: string
  library: { package: string }
  tokens: { prefix: string; typeMixin: string; section: string }
  components?: { restricted?: { name: string; reason: string; instead?: string }[] }
  rules?: Record<string, 'off' | 'error'>
}

/**
 * The validator's options for a profile, its component list (components.json) and its tokens (tokens.json). `local` is what one app adds on
 * top: it may restrict more components, never loosen the company profile.
 */
export function optionsFromProfile(
  profile: Profile,
  components: { allowed: { name: string }[]; disallowed_raw_elements?: string[] },
  tokens: Record<string, any>,
  local: { restricted?: { name: string; reason: string; instead?: string }[] } = {},
): ValidateOptions {
  const section = tokens[profile.tokens.section] ?? {}
  return {
    allowedComponents: components.allowed.map((c) => c.name),
    typeRoles: (section.type?.roles ?? []).map((r: { token: string }) => r.token),
    layerTokens: (section.layer ?? []).map((l: { token: string }) => l.token),
    importFrom: profile.library.package,
    tokenPrefix: profile.tokens.prefix,
    typeMixin: profile.tokens.typeMixin,
    rawElements: components.disallowed_raw_elements,
    restrictedComponents: [...(profile.components?.restricted ?? []), ...(local.restricted ?? [])],
    designSystem: profile.name,
    rules: profile.rules,
  }
}

// role('body-md') or tokens.role("meta") in Sass (the mixin's name is the profile's). A name the mixin does not know stops the Sass build, but only after the linter has passed the file.
const typeRoleRe = (mixin: string) => new RegExp(`\\b${escapeRe(mixin)}\\(\\s*(['"])([^'"]*)\\1\\s*\\)`, 'g')

// Named imports from the library: import { A, B } from 'pkg'.
const namedImportRe = (pkg: string) => new RegExp(`import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${escapeRe(pkg)}['"]`, 'g')
// The ways of importing that would skip the allowlist: a namespace, a default, a path inside the package, require().
const wholeImportRes = (pkg: string) => {
  const q = `['"]${escapeRe(pkg)}`
  return [
    new RegExp(`import\\s*(?:type\\s*)?\\*\\s*as\\s+\\w+\\s+from\\s*${q}['"]`, 'g'),
    new RegExp(`import\\s+(?:type\\s+)?\\w+\\s*(?:,\\s*\\{[^}]*\\}\\s*)?from\\s*${q}['"]`, 'g'),
    new RegExp(`from\\s*${q}/[^'"]*['"]`, 'g'),
    new RegExp(`require\\(\\s*${q}['"]\\s*\\)`, 'g'),
  ]
}
// Type values set by hand in a stylesheet. Every size, line height, tracking and family comes from a type role, so the whole product
// can be re-typeset in one place. font-weight is left to the role too but not enforced: most uses are emphasis inside a role.
const RAW_TYPE_RE = /(?<![\w-])(font-size|line-height|letter-spacing|font-family|font)\s*:\s*([^;}\n]+)/g
const TYPE_INHERIT_RE = /^(?:inherit|initial|unset|revert|normal)$/
// Layering: a number in z-index is a guess about every other layer. Layers come from tokens.
const Z_INDEX_RE = /(?<![\w-])z-index\s*:\s*([^;}\n]+)/g
const Z_INDEX_OK_RE = /^(?:auto|0|inherit|initial|unset|revert|var\(.*\))$/

// A panel docked to the right edge keeps people in the page they are on. There is one way to build it (the right-panel pattern: a passive
// Modal laid out at the right edge), so a hand-positioned fixed element on that edge is flagged. The Modal's own container is the exception.
const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g
const FIXED_RE = /(?<![\w-])position\s*:\s*fixed\b/
const RIGHT_EDGE_RE = /(?<![\w-])(?:inset-inline-end|right)\s*:\s*0(?:rem|px)?\s*(?:;|$)/m
function handRolledPanels(code: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  for (const m of code.matchAll(BLOCK_RE)) {
    const [, selector, body] = m
    if (/cds--modal/.test(selector) || !FIXED_RE.test(body) || !RIGHT_EDGE_RE.test(body)) continue
    const at = (m.index ?? 0) + m[0].indexOf(selector.trim())
    out.push({ text: selector.trim(), line: code.slice(0, at).split('\n').length })
  }
  return out
}

// The opening tag of each <Name ...> in JSX, from "<Name" to its closing ">", skipping braces, strings and arrow functions.
function jsxOpeningTags(code: string, name: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = []
  for (const m of code.matchAll(new RegExp(`<${name}(?=[\\s/>])`, 'g'))) {
    const start = m.index ?? 0
    let depth = 0
    let quote = ''
    let i = start + m[0].length
    for (; i < code.length; i++) {
      const c = code[i]
      if (quote) {
        if (c === quote) quote = ''
        continue
      }
      if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && code[i - 1] !== '=') break
    }
    out.push({ text: code.slice(start, i + 1), line: code.slice(0, start).split('\n').length })
  }
  return out
}

export function validatePage(source: string, options: ValidateOptions = {}): { pass: boolean; violations: Violation[] } {
  const code = stripComments(source)
  const violations: Violation[] = []
  const prefix = options.tokenPrefix ?? '--at-'
  const mixin = options.typeMixin ?? 'role'
  const system = options.designSystem ?? 'the design system'
  const pkg = options.importFrom ?? '@carbon/react'
  const TYPE_ROLE_RE = typeRoleRe(mixin)

  const hex = matchesWithLines(code, HEX_COLOR_RE)
  if (hex.length) {
    violations.push({
      rule: 'no-inline-hex-colors',
      message: `Found ${hex.length} inline hex color(s) (${[...new Set(hex.map((h) => h.text))].join(', ')}). Use a design token instead — see list_design_tokens (fromPrototype in the token registry maps each prototype hex to its ${prefix}* token).`,
      lines: linesOf(hex),
    })
  }

  const fn = matchesWithLines(code, COLOR_FUNCTION_RE)
  if (fn.length) {
    violations.push({
      rule: 'no-color-functions',
      message: `Found ${fn.length} rgb()/hsl() color value(s). Use a design token instead of a computed color.`,
      lines: linesOf(fn),
    })
  }

  const raw = matchesWithLines(code, rawElementRe(options.rawElements ?? DEFAULT_RAW_ELEMENTS))
  if (raw.length) {
    const elements = [...new Set(raw.map((m) => m.text.replace(/[<>\s]/g, '').toLowerCase()))]
    violations.push({
      rule: 'no-raw-html-primitives',
      message: `Found raw HTML element(s) (${elements.join(', ')}) that have components in ${system}. Use the corresponding component from list_components instead.`,
      lines: linesOf(raw),
    })
  }

  const style = matchesWithLines(code, INLINE_STYLE_RE)
  if (style.length) {
    violations.push({
      rule: 'no-inline-style',
      message: `Found ${style.length} inline style attribute(s). Move styling into a CSS Module that uses var(${prefix}*) tokens and the ${mixin}() type mixin; set variants through component props.`,
      lines: linesOf(style),
    })
  }

  const px = matchesWithLines(code, PX_RE).filter((m) => {
    const n = parseFloat(m.text)
    return n !== 0 && n !== 1
  })
  if (px.length) {
    violations.push({
      rule: 'no-raw-px',
      message: `Found ${px.length} raw px value(s) (${[...new Set(px.map((p) => p.text))].slice(0, 8).join(', ')}). Use ${prefix}space-* for spacing, ${prefix}radius-* for corners, the type ${mixin}() mixin for text, and rem for other sizes; only 0 and 1px hairlines may stay literal. list_design_tokens has pxToSpace and pxToType maps.`,
      lines: linesOf(px),
    })
  }

  const dc = matchesWithLines(code, DC_MARKUP_RE)
  if (dc.length) {
    violations.push({
      rule: 'no-design-component-markup',
      message: `Found ${dc.length} Design Component construct(s) (${[...new Set(dc.map((d) => d.text.trim().slice(0, 14)))].slice(0, 5).join(', ')}). This is prototype markup, not React: replace sc-if / sc-for with JSX conditions and map(), {{ }} bindings with props or hooks, and style-hover / style-active with CSS Module :hover and :active states.`,
      lines: linesOf(dc),
    })
  }

  const clickable = matchesWithLines(code, CLICKABLE_NON_INTERACTIVE_RE)
  if (clickable.length) {
    violations.push({
      rule: 'a11y-clickable-non-interactive',
      message: `Found ${clickable.length} onClick handler(s) on non-interactive element(s) (div, span, li, td, p). Keyboard and screen-reader users cannot reach them. Use Button, ClickableTile, SideNavLink or OverflowMenuItem instead.`,
      lines: linesOf(clickable),
    })
  }

  if (options.allowedComponents) {
    const allowed = new Set(options.allowedComponents)
    const unknown: { text: string; line: number }[] = []
    for (const m of code.matchAll(namedImportRe(pkg))) {
      const line = code.slice(0, m.index ?? 0).split('\n').length
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        if (name && !allowed.has(name)) unknown.push({ text: name, line })
      }
    }
    if (unknown.length) {
      violations.push({
        rule: 'component-not-in-allowlist',
        message: `Imported ${[...new Set(unknown.map((u) => u.text))].join(', ')} from '${pkg}', which ${unknown.length > 1 ? 'are' : 'is'} not in the allowed list. Use a component from list_components, or ask for it to be added to registry/components.json.`,
        lines: linesOf(unknown),
      })
    }
  }

  if (options.typeRoles) {
    const known = new Set(options.typeRoles)
    const unknown = matchesWithLines(code, TYPE_ROLE_RE).filter((m) => !known.has(m.text.replace(TYPE_ROLE_RE, '$2')))
    if (unknown.length) {
      violations.push({
        rule: 'type-role-unknown',
        message: `${mixin}() asks for ${[...new Set(unknown.map((u) => u.text.replace(TYPE_ROLE_RE, '$2')))].map((n) => `'${n}'`).join(', ')}, which is not a type role. The roles are ${options.typeRoles.join(', ')} (list_design_tokens, airtable.type.roles).`,
        lines: linesOf(unknown),
      })
    }
  }

  if (options.restrictedComponents?.length) {
    const byName = new Map(options.restrictedComponents.map((r) => [r.name, r]))
    const used: { text: string; line: number }[] = []
    for (const m of code.matchAll(namedImportRe(pkg))) {
      const line = code.slice(0, m.index ?? 0).split('\n').length
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        if (byName.has(name)) used.push({ text: name, line })
      }
    }
    if (used.length) {
      const names = [...new Set(used.map((u) => u.text))]
      violations.push({
        rule: 'component-restricted',
        message: `${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} in the library but this product does not use ${names.length > 1 ? 'them' : 'it'}: ${names.map((n) => `${n}: ${byName.get(n)!.reason}${byName.get(n)!.instead ? ` Use ${byName.get(n)!.instead} instead.` : ''}`).join(' ')}`,
        lines: linesOf(used),
      })
    }
  }

  const whole = wholeImportRes(pkg).flatMap((re) => matchesWithLines(code, re))
  if (whole.length) {
    violations.push({
      rule: 'no-whole-library-import',
      message: `Found ${whole.length} import(s) of '${pkg}' as a namespace, a default, a path inside the package, or require(). Only named imports are checked against the component allowlist: write import { Button } from '${pkg}'.`,
      lines: linesOf(whole),
    })
  }

  const rawType = matchesWithLines(code, RAW_TYPE_RE).filter((m) => !TYPE_INHERIT_RE.test(m.text.replace(RAW_TYPE_RE, '$2').trim()))
  if (rawType.length) {
    violations.push({
      rule: 'no-raw-type-values',
      message: `Found ${rawType.length} hand-set type declaration(s) (${[...new Set(rawType.map((t) => t.text.replace(/\s*:.*$/, '')))].join(', ')}). Size, line height, letter spacing and family come from a type role: @include tokens.${mixin}('<role>'). If no role fits, add one to the design system rather than overriding it here.`,
      lines: linesOf(rawType),
    })
  }

  const zIndex = matchesWithLines(code, Z_INDEX_RE).filter((m) => !Z_INDEX_OK_RE.test(m.text.replace(Z_INDEX_RE, '$1').trim()))
  if (zIndex.length) {
    violations.push({
      rule: 'no-numeric-z-index',
      message: `Found ${zIndex.length} numeric z-index value(s). Use a layer token (${options.layerTokens?.length ? options.layerTokens.map((t) => `var(${t})`).join(', ') : `a ${prefix}z-* token`}; list_design_tokens) so stacking is decided in one place.`,
      lines: linesOf(zIndex),
    })
  }

  const panels = handRolledPanels(code)
  if (panels.length) {
    violations.push({
      rule: 'no-hand-rolled-side-panel',
      message: `Found ${panels.length} element(s) fixed to the right edge by hand (${panels.map((p) => p.text).join(', ')}). A panel that slides in from the right is the right-panel pattern: use the app's RightPanel (search_patterns "right panel") so every one opens, closes and traps focus the same way.`,
      lines: linesOf(panels),
    })
  }

  const iconButtons = [
    ...jsxOpeningTags(code, 'Button').filter((t) => /\bhasIconOnly\b/.test(t.text) && !/\biconDescription\s*=/.test(t.text)),
    ...jsxOpeningTags(code, 'IconButton').filter((t) => !/\blabel\s*=/.test(t.text)),
  ]
  if (iconButtons.length) {
    violations.push({
      rule: 'a11y-icon-button-label',
      message: `Found ${iconButtons.length} icon-only button(s) with no accessible name. Give a Button with hasIconOnly an iconDescription (an IconButton, a label): it is the only text a screen reader gets.`,
      lines: linesOf(iconButtons),
    })
  }

  const imgTags = matchesWithLines(code, IMG_RE)
  const imgsMissingAlt = imgTags.filter((tag) => !/\balt\s*=/.test(tag.text))
  if (imgsMissingAlt.length > 0) {
    violations.push({
      rule: 'a11y-missing-alt',
      message: `Found ${imgsMissingAlt.length} <img> tag(s) without an alt attribute.`,
      lines: linesOf(imgsMissingAlt),
    })
  }

  const kept = violations.filter((v) => options.rules?.[v.rule] !== 'off')
  return { pass: kept.length === 0, violations: kept }
}
