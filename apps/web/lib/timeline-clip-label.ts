/** Short label for timeline clips — full text stays in `title`. */
export function timelineClipLabel(text: string, maxChars = 42): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}
