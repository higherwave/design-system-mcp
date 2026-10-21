import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { loadComponentNames } from './helpers.ts'

const patterns = readdirSync(new URL('../registry/patterns/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, p: JSON.parse(readFileSync(new URL(`../registry/patterns/${f}`, import.meta.url), 'utf8')) }))

test('every pattern has the required fields and a matching file name', () => {
  for (const { file, p } of patterns) {
    for (const k of ['id', 'tags', 'pageType', 'componentsUsed', 'sourceRepo', 'sourcePath', 'sourceUrl', 'description']) assert.ok(k in p, `${file}: missing ${k}`)
    assert.equal(file, `${p.id}.json`)
  }
})

test('components used by patterns are all in the allowed list', () => {
  const allowed = new Set(loadComponentNames())
  for (const { file, p } of patterns) for (const c of p.componentsUsed) assert.ok(allowed.has(c), `${file}: ${c} is not an allowed component`)
})

test('a pattern that ships a snippet passes the validator', async () => {
  const { validatePage } = await import('../lib/validateRules.ts')
  for (const { file, p } of patterns) {
    if (!p.snippet) continue
    const r = validatePage(p.snippet, { allowedComponents: loadComponentNames() })
    assert.deepEqual(r.violations, [], `${file}: snippet fails validation`)
  }
})
