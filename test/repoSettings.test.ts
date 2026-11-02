import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRepositoryUrl, resolveRepo } from '../lib/repoSettings.ts'

const PKG = { type: 'git', url: 'https://github.com/acme/design-system.git' }

test('a repository URL is read in its common spellings', () => {
  for (const u of ['https://github.com/acme/design-system.git', 'https://github.com/acme/design-system', 'git@github.com:acme/design-system.git', 'git+https://github.com/acme/design-system.git/']) {
    assert.deepEqual(parseRepositoryUrl(u), { owner: 'acme', repo: 'design-system' }, u)
  }
  assert.equal(parseRepositoryUrl('https://example.com/nope'), undefined)
  assert.equal(parseRepositoryUrl(undefined), undefined)
})

test('explicit settings win, then the repository Vercel built from, then package.json', () => {
  const vercel = { VERCEL_GIT_REPO_OWNER: 'built-by', VERCEL_GIT_REPO_SLUG: 'fork' }
  assert.deepEqual(resolveRepo({ GITHUB_OWNER: 'me', GITHUB_REPO: 'mine', ...vercel }, PKG), { owner: 'me', repo: 'mine' })
  assert.deepEqual(resolveRepo(vercel, PKG), { owner: 'built-by', repo: 'fork' })
  assert.deepEqual(resolveRepo({}, PKG), { owner: 'acme', repo: 'design-system' })
  assert.deepEqual(resolveRepo({}, PKG.url), { owner: 'acme', repo: 'design-system' }, 'package.json may give a plain string')
})

test('half a setting is refused and nothing configured is a clear error, never a guess', () => {
  assert.throws(() => resolveRepo({ GITHUB_OWNER: 'me' }, PKG), /both GITHUB_OWNER and GITHUB_REPO/)
  assert.throws(() => resolveRepo({ GITHUB_REPO: 'mine' }, PKG), /both GITHUB_OWNER and GITHUB_REPO/)
  assert.throws(() => resolveRepo({}, undefined), /No GitHub repository is configured/)
  assert.throws(() => resolveRepo({ GITHUB_OWNER: '  ', GITHUB_REPO: '' }, 'https://example.com/x'), /No GitHub repository/)
})

test('this repository\'s own package.json names a GitHub repository', async () => {
  const { default: pkg } = await import('../package.json', { with: { type: 'json' } })
  assert.ok(resolveRepo({}, pkg.repository).repo, 'a fork must be able to rely on package.json alone')
})
