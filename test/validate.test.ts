// Run with: npm test   (Node's built-in test runner; no extra dependencies)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePage, stripComments } from '../lib/validateRules.ts'

const rules = (code: string) => validatePage(code).violations.map((v) => v.rule)

test('a clean Carbon page passes', () => {
  const code = `import { Button, ClickableTile } from '@carbon/react'
import styles from './Board.module.scss'
export default function Board() {
  return <ClickableTile className={styles.card}><Button kind="primary">Save</Button></ClickableTile>
}`
  assert.deepEqual(validatePage(code), { pass: true, violations: [] })
})

test('flags hex colors and color functions, with line numbers', () => {
  const r = validatePage(`const a = 1\nconst c = '#181d26'\nconst d = 'rgba(0,0,0,.5)'`)
  assert.deepEqual(r.violations.map((v) => [v.rule, v.lines]), [['no-inline-hex-colors', [2]], ['no-color-functions', [3]]])
})

test('flags inline style in JSX and HTML, but not style-hover (reported as prototype markup)', () => {
  assert.deepEqual(rules(`<Tile style={{ padding: 0 }} />`), ['no-inline-style'])
  assert.deepEqual(rules(`<div style="margin:0">`), ['no-inline-style'])
  assert.deepEqual(rules(`<div style-hover="background:red">`), ['no-design-component-markup'])
})

test('flags raw px except 0 and 1px hairlines; rem and tokens are fine', () => {
  assert.deepEqual(rules(`const x = '12px'`), ['no-raw-px'])
  assert.deepEqual(rules(`const x = 'calc(100vh - 56px)'`), ['no-raw-px'])
  assert.deepEqual(rules(`const border = '1px solid var(--at-hairline)'; const z = '0px'; const w = '2rem'; const s = 'var(--at-space-md)'`), [])
})

test('px inside an identifier, a hash or a variable is not a length', () => {
  assert.deepEqual(rules(`const spx = 3; const a = 'x12px'`), [])
})

test('JSX double braces are not prototype bindings', () => {
  assert.deepEqual(rules(`<Tile style={{ padding: 0 }} />`), ['no-inline-style'])
  assert.deepEqual(rules(`<Tile>{{ label }}</Tile>`), ['no-design-component-markup'])
})

test('flags Design Component constructs', () => {
  const code = `<sc-if value="{{ inProject }}"><sc-for list="{{ groups }}" as="g">{{ g.label }}</sc-for></sc-if>`
  const v = validatePage(code).violations.find((x) => x.rule === 'no-design-component-markup')
  assert.ok(v, 'rule fires')
})

test('flags raw HTML primitives (existing rule) and keeps capitalised components valid', () => {
  assert.deepEqual(rules(`<button onClick={go}>Go</button>`), ['no-raw-html-primitives'])
  assert.deepEqual(rules(`<Button kind="primary">Go</Button>`), [])
})

test('flags onClick on non-interactive elements', () => {
  assert.deepEqual(rules(`<div className="card" onClick={open}>x</div>`), ['a11y-clickable-non-interactive'])
  assert.deepEqual(rules(`<div\n  className="card"\n  onClick={open}\n>x</div>`), ['a11y-clickable-non-interactive'])
  assert.deepEqual(rules(`<ClickableTile onClick={open}>x</ClickableTile>`), [])
})

test('flags images without alt (existing rule)', () => {
  assert.deepEqual(rules(`<img src="a.png">`), ['a11y-missing-alt'])
  assert.deepEqual(rules(`<img src="a.png" alt="Logo">`), [])
})

test('comments are ignored; URLs are not mistaken for comments', () => {
  assert.deepEqual(rules(`// padding was 16px and #fff\n/* old: rgb(0,0,0) 12px */\nconst ok = 1`), [])
  assert.deepEqual(rules(`const u = 'https://example.com/a#abc123'`), ['no-inline-hex-colors'])
  assert.equal(stripComments('a\n/* x\ny */\nb').split('\n').length, 4, 'line numbers are preserved')
})

test('reports every rule a raw prototype page breaks', () => {
  const proto = `<div onClick="{{ go }}" style="background:#faf3e6;padding:12px" style-hover="background:#fff"><button>Save</button></div>`
  assert.deepEqual(rules(proto).sort(), [
    'a11y-clickable-non-interactive', 'no-design-component-markup', 'no-inline-hex-colors', 'no-inline-style', 'no-raw-html-primitives', 'no-raw-px',
  ].sort())
})

test('imports from @carbon/react must be in the allowed list when a list is supplied', () => {
  const allowed = ['Button', 'ClickableTile', 'Tag']
  const ok = `import { Button, Tag as Chip } from '@carbon/react'`
  const bad = `import { Button, Accordion,\n  Slider } from '@carbon/react'`
  assert.deepEqual(validatePage(ok, { allowedComponents: allowed }).violations, [])
  const v = validatePage(bad, { allowedComponents: allowed }).violations
  assert.deepEqual(v.map((x) => x.rule), ['component-not-in-allowlist'])
  assert.match(v[0].message, /Accordion, Slider/)
  assert.deepEqual(validatePage(bad).violations, [], 'no list supplied: import check is skipped')
  assert.deepEqual(validatePage(`import { Anything } from '@carbon/icons-react'`, { allowedComponents: allowed }).violations, [], 'icons are not checked')
})

// Phase 1 gate: the validator rejects a prototype page and passes a hand-built reference page.
import { readFileSync } from 'node:fs'
import { loadComponentNames } from './helpers.ts'

test('GATE: the prototype story card fails, and the hand-built reference passes (page and styles)', () => {
  const allowedComponents = loadComponentNames()
  const proto = validatePage(readFileSync(new URL('./fixtures/prototype-story-card.html', import.meta.url), 'utf8'), { allowedComponents })
  assert.equal(proto.pass, false)
  assert.deepEqual(proto.violations.map((v) => v.rule).sort(), [
    'a11y-clickable-non-interactive', 'no-design-component-markup', 'no-inline-hex-colors', 'no-inline-style', 'no-raw-html-primitives', 'no-raw-px',
  ].sort())

  const tsx = validatePage(readFileSync(new URL('./fixtures/StoryCard.tsx', import.meta.url), 'utf8'), { allowedComponents })
  const scss = validatePage(readFileSync(new URL('./fixtures/StoryCard.module.scss', import.meta.url), 'utf8'), { allowedComponents })
  assert.deepEqual(tsx, { pass: true, violations: [] })
  assert.deepEqual(scss, { pass: true, violations: [] })
})
