import { Octokit } from '@octokit/rest'
import type { Pattern } from './registry'

const OWNER = 'higherwave'
const REPO = 'design-system-mcp'

export async function openRegisterPatternPR(
  pattern: Pattern,
): Promise<{ url: string; number: number }> {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN is not configured on the server')
  }
  const octokit = new Octokit({ auth: token })

  const { data: repo } = await octokit.repos.get({ owner: OWNER, repo: REPO })
  const defaultBranch = repo.default_branch

  const { data: ref } = await octokit.git.getRef({
    owner: OWNER,
    repo: REPO,
    ref: `heads/${defaultBranch}`,
  })
  const baseSha = ref.object.sha

  const branchName = `register-pattern/${pattern.id}-${Date.now()}`
  await octokit.git.createRef({
    owner: OWNER,
    repo: REPO,
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  })

  const filePath = `registry/patterns/${pattern.id}.json`
  const content = Buffer.from(JSON.stringify(pattern, null, 2) + '\n', 'utf-8').toString('base64')

  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path: filePath,
    message: `Register pattern: ${pattern.id}`,
    content,
    branch: branchName,
  })

  const { data: pr } = await octokit.pulls.create({
    owner: OWNER,
    repo: REPO,
    title: `Register pattern: ${pattern.id}`,
    head: branchName,
    base: defaultBranch,
    body: `Adds \`${filePath}\` to the pattern registry.\n\n**Description:** ${pattern.description}\n**Source:** ${pattern.sourceUrl}`,
  })

  return { url: pr.html_url, number: pr.number }
}
