/**
 * PLEXON Collection ids are UUIDs. Local / fixture placeholders must be treated as
 * unbound so VIDEON never calls federation with a non-Collection id.
 */

const PLATFORM_PROJECT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isRealPlatformProjectId(id: string | null | undefined): boolean {
  const trimmed = id?.trim()
  if (!trimmed) return false
  return PLATFORM_PROJECT_UUID_RE.test(trimmed)
}
