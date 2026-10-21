export type Violation = {
  rule: string
  message: string
  /** First few 1-based line numbers where the rule matched (comments are ignored). */
  lines?: number[]
}

// ---------------------------------------------------------------------------------------------
// Rules for pages generated from a Design Component prototype (inline styles, raw hex, px) into
// Carbon + the Airtable layer. Every rule is deterministic: same code in, same result out.
// Known limits are noted next to each pattern; the validator is a guard, not a parser.
// ---------------------------------------------------------------------------------------------

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
// rgb(), rgba(), hsl(), hsla() evade the hex rule, so they are checked too.
const COLOR_FUNCTION_RE = /\b(?:rgba?|hsla?)\(/g
// No `i` flag: JSX component names are capitalized (<Button>), raw HTML
// elements are lowercase (<button>) — case must distinguish them.
const RAW_ELEMENT_RE = /<(button|input|select|textarea|table)[\s>]/g
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
}

// Named imports from '@carbon/react'. Limit: namespace and default imports are not inspected.
const CARBON_IMPORT_RE = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]@carbon\/react['"]/g

export function validatePage(source: string, options: ValidateOptions = {}): { pass: boolean; violations: Violation[] } {
  const code = stripComments(source)
  const violations: Violation[] = []

  const hex = matchesWithLines(code, HEX_COLOR_RE)
  if (hex.length) {
    violations.push({
      rule: 'no-inline-hex-colors',
      message: `Found ${hex.length} inline hex color(s) (${[...new Set(hex.map((h) => h.text))].join(', ')}). Use a design token instead — see list_design_tokens (Airtable layer: fromPrototype maps each prototype hex to its --at-* token).`,
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

  const raw = matchesWithLines(code, RAW_ELEMENT_RE)
  if (raw.length) {
    const elements = [...new Set(raw.map((m) => m.text.replace(/[<>\s]/g, '').toLowerCase()))]
    violations.push({
      rule: 'no-raw-html-primitives',
      message: `Found raw HTML element(s) (${elements.join(', ')}) that have Carbon equivalents. Use the corresponding component from list_components instead.`,
      lines: linesOf(raw),
    })
  }

  const style = matchesWithLines(code, INLINE_STYLE_RE)
  if (style.length) {
    violations.push({
      rule: 'no-inline-style',
      message: `Found ${style.length} inline style attribute(s). Move styling into a CSS Module that uses var(--at-*) / var(--cds-*) tokens and the role() type mixin; set variants through component props.`,
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
      message: `Found ${px.length} raw px value(s) (${[...new Set(px.map((p) => p.text))].slice(0, 8).join(', ')}). Use --at-space-* for spacing, --at-radius-* for corners, the type role() mixin for text, and rem for other sizes; only 0 and 1px hairlines may stay literal. list_design_tokens has pxToSpace and pxToType maps.`,
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
    for (const m of code.matchAll(CARBON_IMPORT_RE)) {
      const line = code.slice(0, m.index ?? 0).split('\n').length
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        if (name && !allowed.has(name)) unknown.push({ text: name, line })
      }
    }
    if (unknown.length) {
      violations.push({
        rule: 'component-not-in-allowlist',
        message: `Imported ${[...new Set(unknown.map((u) => u.text))].join(', ')} from '@carbon/react', which ${unknown.length > 1 ? 'are' : 'is'} not in the allowed list. Use a component from list_components, or ask for it to be added to registry/components.json.`,
        lines: linesOf(unknown),
      })
    }
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

  return { pass: violations.length === 0, violations }
}
