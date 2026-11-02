// Which GitHub repository register_pattern opens its pull request in. Nothing about a company is written into the code:
//   1. GITHUB_OWNER and GITHUB_REPO, when set (both);
//   2. else the repository Vercel built this deployment from (VERCEL_GIT_REPO_OWNER and VERCEL_GIT_REPO_SLUG);
//   3. else the `repository` URL in package.json, so a fork that changes that one line needs no other setting.
// Kept free of imports so the tests can load it directly.
export type RepoTarget = { owner: string; repo: string }

export function parseRepositoryUrl(url: string | undefined): RepoTarget | undefined {
  const m = (url ?? '').trim().match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i)
  return m ? { owner: m[1], repo: m[2] } : undefined
}

export function resolveRepo(env: Record<string, string | undefined>, packageRepository?: string | { url?: string }): RepoTarget {
  const owner = env.GITHUB_OWNER?.trim()
  const repo = env.GITHUB_REPO?.trim()
  if (owner && repo) return { owner, repo }
  if (owner || repo) throw new Error('Set both GITHUB_OWNER and GITHUB_REPO, or neither.')
  const vercelOwner = env.VERCEL_GIT_REPO_OWNER?.trim()
  const vercelRepo = env.VERCEL_GIT_REPO_SLUG?.trim()
  if (vercelOwner && vercelRepo) return { owner: vercelOwner, repo: vercelRepo }
  const fromPackage = parseRepositoryUrl(typeof packageRepository === 'string' ? packageRepository : packageRepository?.url)
  if (fromPackage) return fromPackage
  throw new Error('No GitHub repository is configured. Set GITHUB_OWNER and GITHUB_REPO, or add a "repository" URL to package.json.')
}
