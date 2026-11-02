// Checks that the colour pairs the design system tells people to use together are readable (WCAG 2.2 contrast).
//   npm run check:contrast [path/to/theme.scss] [path/to/tokens.json]
// The pairs are in the registry (airtable.contrast): text on its background needs 4.5:1 (3:1 for large text and for the borders of
// controls). A pair marked `known` fails today and is a decision for the design owner; it is listed, not hidden, and it stops
// failing the check only while it stays marked. Exits 1 on a new failure, or when a `known` pair has since been fixed (remove the mark).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const themePath = resolve(process.argv[2] || join(here, '..', '..', 'apptest1', 'src', 'theme.scss'))
const registryPath = resolve(process.argv[3] || join(here, '..', 'registry', 'tokens.json'))
const profileFile = join(dirname(registryPath), 'profile.json')
const profile = existsSync(profileFile) ? JSON.parse(readFileSync(profileFile, 'utf8')) : { tokens: { prefix: '--at-', section: 'airtable' } }
const TOKEN_RE = `(${profile.tokens.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]+)`
const pairs = JSON.parse(readFileSync(registryPath, 'utf8'))[profile.tokens.section].contrast ?? []
const scss = readFileSync(themePath, 'utf8').replace(/\/\/.*$/gm, '')

// The last definition wins, as in the cascade.
const defs = new Map()
for (const m of scss.matchAll(new RegExp(`${TOKEN_RE}\\s*:\\s*([^;]+);`, 'g'))) defs.set(m[1], m[2].trim())
const hexOf = (token, seen = new Set()) => {
  const v = defs.get(token)
  if (v === undefined || seen.has(token)) return undefined
  const alias = v.match(new RegExp(`^var\\(${TOKEN_RE}\\)$`))
  if (alias) return hexOf(alias[1], new Set([...seen, token]))
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined
}
const channel = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255) }
export const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

const problems = []
let ok = 0
for (const p of pairs) {
  const fg = hexOf(p.fg), bg = hexOf(p.bg)
  if (!fg || !bg) { problems.push(`${p.fg} on ${p.bg}: a token is not a plain hex colour in theme.scss`); continue }
  const r = ratio(fg, bg)
  const pass = r >= p.min
  if (pass && p.known) problems.push(`${p.fg} on ${p.bg} now passes (${r.toFixed(2)}:1): remove "known" from the registry`)
  else if (!pass && !p.known) problems.push(`${p.fg} on ${p.bg}: ${r.toFixed(2)}:1, needs ${p.min}:1 (${p.use})`)
  else if (!pass && p.known) console.log(`  known: ${p.fg} on ${p.bg} is ${r.toFixed(2)}:1, needs ${p.min}:1 (${p.use}). ${p.known}`)
  else ok++
}
if (problems.length) { console.error('Contrast problems:\n' + problems.map((p) => '  ' + p).join('\n')); process.exit(1) }
console.log(`Contrast: ${ok} of ${pairs.length} pairs pass${pairs.length - ok ? `, ${pairs.length - ok} known` : ''}.`)
