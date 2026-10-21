import { readFileSync } from 'node:fs'

export function loadComponentNames(): string[] {
  const file = new URL('../registry/components.json', import.meta.url)
  return (JSON.parse(readFileSync(file, 'utf8')) as { allowed: { name: string }[] }).allowed.map((c) => c.name)
}
