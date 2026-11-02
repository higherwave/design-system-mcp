// Keeps registry/tokens.json in step with the stylesheet that defines the tokens.
//   npm run check:tokens [path/to/theme.scss] [path/to/tokens.json]
// Checks that every --at-* token named in the registry exists in theme.scss, and that every exact
// entry in airtable.fromPrototype maps a hex to a token whose value is that hex (aliases such as
// var(--at-x) are followed). A token defined twice with different values fails. Every colour token theme.scss defines must also be in the registry. Exits 1 on a mismatch.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const themePath = resolve(process.argv[2] || join(here, '..', '..', 'apptest1', 'src', 'theme.scss'))
const registryPath = resolve(process.argv[3] || join(here, '..', 'registry', 'tokens.json'))
// The design system's token prefix and where its tokens sit in tokens.json come from profile.json beside it (the Airtable layer's, if absent).
const profileFile = join(dirname(registryPath), 'profile.json')
const profile = existsSync(profileFile) ? JSON.parse(readFileSync(profileFile, 'utf8')) : { tokens: { prefix: '--at-', section: 'airtable' } }
const PREFIX = profile.tokens.prefix
const TOKEN_RE = `(${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9-]+)`
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))[profile.tokens.section]
const scss = readFileSync(themePath, 'utf8').replace(/\/\/.*$/gm, '')

// The last definition wins, as in the cascade. A token defined twice with different values is a mistake: which one a page gets
// depends on file order, and the registry can only describe one of them.
const defs = new Map()
const duplicates = []
for (const m of scss.matchAll(new RegExp(`${TOKEN_RE}\\s*:\\s*([^;]+);`, 'g'))) {
  const value = m[2].trim()
  if (defs.has(m[1]) && defs.get(m[1]).toLowerCase() !== value.toLowerCase()) duplicates.push(`${m[1]} is defined twice, as ${defs.get(m[1])} and ${value}`)
  defs.set(m[1], value)
}

const resolveValue = (token, seen = new Set()) => {
  const v = defs.get(token)
  if (v === undefined || seen.has(token)) return undefined
  const alias = v.match(new RegExp(`^var\\(${TOKEN_RE}\\)$`))
  return alias ? resolveValue(alias[1], new Set([...seen, token])) : v.toLowerCase()
}

const named = new Set()
const walk = (x) => {
  if (Array.isArray(x)) x.forEach(walk)
  else if (x && typeof x === 'object') {
    if (typeof x.token === 'string' && x.token.startsWith(PREFIX)) named.add(x.token)
    Object.entries(x).forEach(([k, v]) => { if (k !== 'fromPrototype') walk(v) })
  }
}
walk(registry)
for (const [, tok] of Object.entries(registry.pxToSpace.map)) named.add(tok)

const problems = [...duplicates]
for (const t of [...named].sort()) if (!defs.has(t)) problems.push(`registry names ${t}, which theme.scss does not define`)
for (const e of registry.fromPrototype.map) {
  if (!defs.has(e.token)) { problems.push(`fromPrototype ${e.hex} -> ${e.token}: token not defined`); continue }
  if (e.exact && resolveValue(e.token) !== e.hex.toLowerCase()) problems.push(`fromPrototype ${e.hex} -> ${e.token}: theme.scss has ${resolveValue(e.token)}`)
}
const hexTokens = [...defs.keys()].filter((t) => /^#/.test(resolveValue(t) ?? ''))
const covered = new Set([...named, ...registry.fromPrototype.map.map((e) => e.token)])
const undocumented = hexTokens.filter((t) => !covered.has(t))

// A colour token the app defines but the registry never mentions would be invisible to everyone who builds from the registry.
if (undocumented.length) problems.push(...undocumented.map((t) => `${t} is defined in theme.scss but is not in the registry: add it to airtable.color with its use`))
if (problems.length) { console.error('Token registry is out of step with theme.scss:\n' + problems.map((p) => '  ' + p).join('\n')); process.exit(1) }
console.log(`Token registry matches ${themePath.split('/').slice(-3).join('/')}: ${named.size} tokens named, ${registry.fromPrototype.map.length} prototype hex values mapped.`)
