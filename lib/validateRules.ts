export type Violation = { rule: string; message: string }

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
// No `i` flag: JSX component names are capitalized (<Button>), raw HTML
// elements are lowercase (<button>) — case must distinguish them.
const RAW_ELEMENT_RE = /<(button|input|select|textarea|table)[\s>]/g
const IMG_RE = /<img[\s>][^>]*>/g

export function validatePage(code: string): { pass: boolean; violations: Violation[] } {
  const violations: Violation[] = []

  const hexMatches = code.match(HEX_COLOR_RE)
  if (hexMatches) {
    violations.push({
      rule: 'no-inline-hex-colors',
      message: `Found ${hexMatches.length} inline hex color(s) (${[...new Set(hexMatches)].join(', ')}). Use Carbon design tokens instead — see list_design_tokens.`,
    })
  }

  const rawMatches = code.match(RAW_ELEMENT_RE)
  if (rawMatches) {
    const elements = [...new Set(rawMatches.map((m) => m.replace(/[<>\s]/g, '').toLowerCase()))]
    violations.push({
      rule: 'no-raw-html-primitives',
      message: `Found raw HTML element(s) (${elements.join(', ')}) that have Carbon equivalents. Use the corresponding component from list_components instead.`,
    })
  }

  const imgTags = code.match(IMG_RE) ?? []
  const imgsMissingAlt = imgTags.filter((tag) => !/\balt\s*=/.test(tag))
  if (imgsMissingAlt.length > 0) {
    violations.push({
      rule: 'a11y-missing-alt',
      message: `Found ${imgsMissingAlt.length} <img> tag(s) without an alt attribute.`,
    })
  }

  return { pass: violations.length === 0, violations }
}
