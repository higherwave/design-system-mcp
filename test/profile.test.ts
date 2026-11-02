// The profile: one file that says which design system governs a product. The engine has no design system built in, so these tests run
// this product's profile, then a made-up second design system through the same code, including the token and contrast scripts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { optionsFromProfile, validatePage, type Profile } from '../lib/validateRules.ts'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../registry/${name}`, import.meta.url), 'utf8'))
const profile = read('profile.json') as Profile & { profile: number }
const components = read('components.json')
const tokens = read('tokens.json')

test('this product’s profile is consistent with its component list and its tokens', () => {
  assert.equal(profile.profile, 1)
  assert.ok(profile.name)
  for (const c of components.allowed) assert.equal(c.import, profile.library.package, `${c.name} imports from the profile's package`)
  const section = tokens[profile.tokens.section]
  assert.ok(section, 'the tokens section the profile names exists')
  assert.ok(section.type.roles.length > 0)
  const walk = (x: any): string[] => (Array.isArray(x) ? x.flatMap(walk) : x && typeof x === 'object' ? [...(typeof x.token === 'string' ? [x.token] : []), ...Object.entries(x).filter(([k]) => k !== 'fromPrototype').flatMap(([, v]) => walk(v))] : [])
  for (const t of walk(section)) if (t.startsWith('--')) assert.ok(t.startsWith(profile.tokens.prefix), `${t} starts with the profile's prefix`)
  for (const r of profile.components?.restricted ?? []) {
    assert.ok(components.allowed.some((c: { name: string }) => c.name === r.name), `${r.name} is restricted but not in the component list: remove it from one`)
    assert.ok(r.reason, `${r.name} needs a reason`)
  }
  for (const name of Object.keys(profile.rules ?? {})) assert.ok(name.length > 0)
})

test('the options come from the profile, and a product may restrict more but never loosen the profile', () => {
  const o = optionsFromProfile(profile, components, tokens, { restricted: [{ name: 'Tabs', reason: 'This app navigates with routes.', instead: 'SideNav' }] })
  assert.equal(o.importFrom, '@carbon/react')
  assert.equal(o.tokenPrefix, '--at-')
  assert.equal(o.typeMixin, 'role')
  assert.ok(o.typeRoles!.includes('eyebrow'))
  assert.ok(o.layerTokens!.includes('--at-z-header'))
  assert.ok(o.allowedComponents!.includes('TabList') && o.allowedComponents!.includes('TableCell') && o.allowedComponents!.includes('Switch'), 'tabs and tables are usable')
  assert.deepEqual(o.restrictedComponents, [{ name: 'Tabs', reason: 'This app navigates with routes.', instead: 'SideNav' }])
  const own = optionsFromProfile({ ...profile, components: { restricted: [{ name: 'Modal', reason: 'Company rule.' }] }, rules: { 'no-numeric-z-index': 'off' } }, components, tokens, { restricted: [{ name: 'Tabs', reason: 'x' }] })
  assert.deepEqual(own.restrictedComponents!.map((r) => r.name), ['Modal', 'Tabs'], 'the company’s restrictions come first and stay')
  assert.deepEqual(own.rules, { 'no-numeric-z-index': 'off' })
})

test('tabs and tables are allowed; a restricted component says why and what to use; a rule can be switched off by the profile', () => {
  const o = optionsFromProfile(profile, components, tokens)
  const page = `import { Tabs, TabList, Tab, TabPanels, TabPanel, DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@carbon/react'`
  assert.deepEqual(validatePage(page, o).violations, [])
  assert.ok(validatePage(`<table><tr><td>x</td></tr></table>`, o).violations.some((v) => v.rule === 'no-raw-html-primitives'), 'a raw table is still refused')

  const restricted = optionsFromProfile(profile, components, tokens, { restricted: [{ name: 'Tabs', reason: 'This app navigates with routes.', instead: 'SideNav' }] })
  const r = validatePage(`import { Tabs } from '@carbon/react'\nimport { Button } from '@carbon/react'`, restricted)
  assert.deepEqual(r.violations.map((v) => [v.rule, v.lines]), [['component-restricted', [1]]])
  assert.match(r.violations[0].message, /Tabs: This app navigates with routes\. Use SideNav instead\./)
  assert.equal(validatePage(`.a { z-index: 5; }`, { rules: { 'no-numeric-z-index': 'off' } }).pass, true)
  assert.equal(validatePage(`.a { z-index: 5; }`, {}).pass, false)
})

const ACME_PROFILE: Profile = { name: 'Acme UI', library: { package: '@acme/ui' }, tokens: { prefix: '--acme-', typeMixin: 'type', section: 'acme' }, components: { restricted: [{ name: 'Marquee', reason: 'It auto-plays.', instead: 'Banner' }] } }
const ACME_COMPONENTS = { allowed: [{ name: 'Button' }, { name: 'Banner' }, { name: 'Marquee' }], disallowed_raw_elements: ['button', 'a'] }
const ACME_TOKENS = {
  acme: {
    type: { roles: [{ token: 'body' }, { token: 'heading' }] },
    layer: [{ token: '--acme-layer-top', use: 'above everything the product draws' }],
    color: { text: [{ token: '--acme-ink', use: 'text' }, { token: '--acme-paper', use: 'page' }] },
    fromPrototype: { map: [] },
    pxToSpace: { map: {} },
    contrast: [{ fg: '--acme-ink', bg: '--acme-paper', min: 4.5, use: 'body text' }],
  },
}

test('a second design system runs through the same engine: its package, prefix, mixin and raw elements', () => {
  const o = optionsFromProfile(ACME_PROFILE, ACME_COMPONENTS, ACME_TOKENS)
  const rules = (code: string) => validatePage(code, o).violations.map((v) => v.rule)
  assert.deepEqual(rules(`import { Button, Banner } from '@acme/ui'`), [])
  assert.deepEqual(rules(`import { Button } from '@carbon/react'`), [], 'Carbon is just another module here, not checked')
  assert.deepEqual(rules(`import * as UI from '@acme/ui'`), ['no-whole-library-import'])
  assert.deepEqual(rules(`import { Marquee } from '@acme/ui'`), ['component-restricted'])
  assert.deepEqual(rules(`.a { @include type('body'); }`), [])
  assert.deepEqual(rules(`.a { @include type('footnote'); }`), ['type-role-unknown'])
  assert.deepEqual(rules(`.a { @include role('footnote'); }`), [], 'role() is Carbon-layer vocabulary; this system calls its mixin type()')
  assert.deepEqual(rules(`<a href="x">x</a>`), ['no-raw-html-primitives'], 'its own list of elements that must be components')
  assert.deepEqual(rules(`<table></table>`), [], 'a table is not on its list')
  const z = validatePage(`.a { z-index: 9; }`, o).violations[0]
  assert.match(z.message, /var\(--acme-layer-top\)/)
  assert.match(validatePage(`const c = '#fff'`, o).violations[0].message, /--acme-\*/)
})

test('the token and contrast scripts follow the profile’s prefix and section', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acme-'))
  writeFileSync(join(dir, 'profile.json'), JSON.stringify(ACME_PROFILE))
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify(ACME_TOKENS))
  const theme = join(dir, 'theme.scss')
  const run = (script: string) => execFileSync('node', [new URL(`../scripts/${script}`, import.meta.url).pathname, theme, join(dir, 'tokens.json')], { encoding: 'utf8', stdio: 'pipe' })
  writeFileSync(theme, ':root { --acme-ink: #101010; --acme-paper: #ffffff; --acme-layer-top: 100; --acme-extra: #ff0000; }')
  assert.throws(() => run('check-tokens.mjs'), (e: any) => /--acme-extra is defined in theme.scss but is not in the registry/.test(e.stderr), 'an unregistered colour of this system fails')
  writeFileSync(theme, ':root { --acme-ink: #101010; --acme-paper: #ffffff; --acme-layer-top: 100; }')
  assert.match(run('check-tokens.mjs'), /Token registry matches/)
  assert.match(run('check-contrast.mjs'), /1 of 1 pairs pass/)
  writeFileSync(theme, ':root { --acme-ink: #cccccc; --acme-paper: #ffffff; --acme-layer-top: 100; }')
  assert.throws(() => run('check-contrast.mjs'), (e: any) => /--acme-ink on --acme-paper/.test(e.stderr))
})
