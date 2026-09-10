/** Pure collection list normalizer — no host deps. */

/**
 * @param {unknown} payload
 * @returns {{ id: string, name: string, status: string }[]}
 */
export function normalizeCollections(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : []

  const out = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!id || !name) continue
    out.push({
      id,
      name,
      status: typeof item.status === 'string' ? item.status : 'active',
    })
  }
  return out
}
