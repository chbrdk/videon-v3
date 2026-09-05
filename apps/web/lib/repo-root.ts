import { access } from 'node:fs/promises'
import { join } from 'node:path'

/** Resolve the monorepo root when Next runs from apps/web in Docker or locally. */
export function resolveRepoRoot(): string {
  const configured = process.env.VIDEON_REPO_ROOT?.trim()
  if (configured) return configured

  const cwd = process.cwd().replace(/\\/g, '/')
  if (cwd.endsWith('/apps/web')) return join(process.cwd(), '..', '..')
  return process.cwd()
}

export async function resolveRepoScript(relativePath: string): Promise<string> {
  const candidates = [
    join(resolveRepoRoot(), relativePath),
    join(process.cwd(), relativePath),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try next candidate
    }
  }
  return candidates[0]
}
