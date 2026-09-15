import fs from 'node:fs'
import path from 'node:path'

export type Pattern = {
  id: string
  tags: string[]
  pageType: string
  componentsUsed: string[]
  sourceRepo: string
  sourcePath: string
  sourceUrl: string
  liveUrl: string | null
  description: string
  snippet: string | null
}

const REGISTRY_ROOT = path.join(process.cwd(), 'registry')

export function loadTokens(): unknown {
  return JSON.parse(fs.readFileSync(path.join(REGISTRY_ROOT, 'tokens.json'), 'utf-8'))
}

export function loadComponents(): unknown {
  return JSON.parse(fs.readFileSync(path.join(REGISTRY_ROOT, 'components.json'), 'utf-8'))
}

export function loadPatterns(): Pattern[] {
  const dir = path.join(REGISTRY_ROOT, 'patterns')
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as Pattern)
}

export function getPattern(id: string): Pattern | undefined {
  return loadPatterns().find((pattern) => pattern.id === id)
}

export function searchPatterns(query: {
  tags?: string[]
  pageType?: string
  componentsUsed?: string[]
}): { pattern: Pattern; score: number }[] {
  return loadPatterns()
    .map((pattern) => {
      let score = 0
      if (query.pageType && pattern.pageType === query.pageType) score += 3
      if (query.tags) {
        score += query.tags.filter((tag) => pattern.tags.includes(tag)).length
      }
      if (query.componentsUsed) {
        score += query.componentsUsed.filter((component) =>
          pattern.componentsUsed.includes(component),
        ).length
      }
      return { pattern, score }
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
}
