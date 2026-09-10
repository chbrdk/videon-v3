/**
 * Sanitize opaque Premiere XMEML filter blocks for storage / re-export.
 * Only keeps <filter>…</filter> fragments — never invents Cut UI.
 */
export function extractPremiereFilterBlocks(clipItemBody: string): string {
  const blocks: string[] = []
  const re = /<filter\b[\s\S]*?<\/filter>/gi
  let m
  while ((m = re.exec(String(clipItemBody || '')))) {
    const block = m[0].trim()
    if (block) blocks.push(block)
  }
  return sanitizePremiereFiltersXml(blocks.join('\n'))
}

export function sanitizePremiereFiltersXml(raw: string | null | undefined): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  // Refuse anything that is not filter-shaped (defense in depth).
  if (!/<filter\b/i.test(text)) return null
  if (/<\s*script\b/i.test(text)) return null
  if (text.length > 512_000) return text.slice(0, 512_000)
  return text
}
