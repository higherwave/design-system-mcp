// Keeps registry/tokens.json in step with the stylesheet that defines the tokens.
//   npm run check:tokens [path/to/theme.scss]
// Checks that every --at-* token named in the registry exists in theme.scss, and that every exact
// entry in airtable.fromPrototype maps a hex to a token whose value is that hex (aliases such as
// var(--at-x) are followed). Exits 1 on a mismatch.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const themePath = resolve(process.argv[2] || join(here, '..', '..', 'apptest1', 'src', 'theme.scss'))
const registry = JSON.parse(readFileSync(join(here, '..', 'registry', 'tokens.json'), 'utf8')).airtable
const scss = readFileSync(themePath, 'utf8').replace(/\/\/.*$/gm, '')

const defs = new Map()
for (const m of scss.matchAll(/(--at-[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!defs.has(m[1])) defs.set(m[1], m[2].trim())

const resolveValue = (token, seen = new Set()) => {
  const v = defs.get(token)
  if (v === undefined || seen.has(token)) return undefined
  const alias = v.match(/^var\((--at-[a-z0-9-]+)\)$/)
  return alias ? resolveValue(alias[1], new Set([...seen, token])) : v.toLowerCase()
}

const named = new Set()
const walk = (x) => {
  if (Array.isArray(x)) x.forEach(walk)
  else if (x && typeof x === 'object') {
    if (typeof x.token === 'string' && x.token.startsWith('--at-')) named.add(x.token)
    Object.entries(x).forEach(([k, v]) => { if (k !== 'fromPrototype') walk(v) })
  }
}
walk(registry)
for (const [, tok] of Object.entries(registry.pxToSpace.map)) named.add(tok)

const problems = []
for (const t of [...named].sort()) if (!defs.has(t)) problems.push(`registry names ${t}, which theme.scss does not define`)
for (const e of registry.fromPrototype.map) {
  if (!defs.has(e.token)) { problems.push(`fromPrototype ${e.hex} -> ${e.token}: token not defined`); continue }
  if (e.exact && resolveValue(e.token) !== e.hex.toLowerCase()) problems.push(`fromPrototype ${e.hex} -> ${e.token}: theme.scss has ${resolveValue(e.token)}`)
}
const hexTokens = [...defs.keys()].filter((t) => /^#/.test(resolveValue(t) ?? ''))
const covered = new Set([...named, ...registry.fromPrototype.map.map((e) => e.token)])
const undocumented = hexTokens.filter((t) => !covered.has(t))

if (problems.length) { console.error('Token registry is out of step with theme.scss:\n' + problems.map((p) => '  ' + p).join('\n')); process.exit(1) }
console.log(`Token registry matches ${themePath.split('/').slice(-3).join('/')}: ${named.size} tokens named, ${registry.fromPrototype.map.length} prototype hex values mapped.`)
if (undocumented.length) console.log(`Note: ${undocumented.length} colour token(s) in theme.scss are not in the registry: ${undocumented.join(', ')}`)
