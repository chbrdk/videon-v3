import { paths } from './paths'

export function authSecret(): string {
  const configured = process.env[paths.envAuthSecret]?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${paths.envAuthSecret} must be at least 32 characters in production`)
  }
  return 'videon-v3-development-only-secret-change-before-production'
}
