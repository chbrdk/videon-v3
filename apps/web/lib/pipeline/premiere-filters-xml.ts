/**
 * Best-effort opaque Premiere XMEML sidecars for Cut ↔ Premiere round-trip.
 * Spec Wave P3.1 — no Videon UI; re-injected on premiere_xml export.
 */

const MAX_SIDECAR_CHARS = 1_500_000

/** Top-level clipitem children we regenerate ourselves — strip these from residual. */
const MANAGED_CLIPITEM_TAGS = new Set([
  'name',
  'enabled',
  'start',
  'end',
  'in',
  'out',
  'file',
  'sourcetrack',
  'link',
  'pproticksin',
  'pproticksout',
  'pproticksduration',
])

/**
 * Whitelist of known useful extras if residual strip is empty; also used as
 * primary extract when residual parsing is ambiguous.
 */
const CLIP_SIDECAR_TAG_RE =
  /<(filter|labels|comments|marker|markers|logginginfo|fielddominance|alphatype|pixelaspectratio|anamorphic|stillframe|historyid|masterclipid|ismasterclip|label2|pprocolorspace|filmtranslate|itemhistory|compositemode|syncoffset|softdelete|keeptime|rate|timecode|duration|mediatypes|channelcount)\b[\s\S]*?<\/\1>/gi

const TRANSITION_RE = /<transitionitem\b[\s\S]*?<\/transitionitem>/gi
const GENERATOR_RE = /<(generatoritem|title)\b[\s\S]*?<\/\1>/gi

function truncate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (/<\s*script\b/i.test(trimmed)) return null
  if (trimmed.length > MAX_SIDECAR_CHARS) return trimmed.slice(0, MAX_SIDECAR_CHARS)
  return trimmed
}

/** Extract top-level elements from a clipitem body (no nesting walk beyond first level). */
export function extractTopLevelXmlElements(body: string): string[] {
  const src = String(body || '')
  const out: string[] = []
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) break
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      i = end < 0 ? src.length : end + 3
      continue
    }
    const tagMatch = src.slice(lt).match(/^<\/?([A-Za-z_][\w.-]*)/)
    if (!tagMatch) {
      i = lt + 1
      continue
    }
    const tag = tagMatch[1]
    if (src[lt + 1] === '/') {
      i = lt + 2
      continue
    }
    const selfClose = src.slice(lt).match(new RegExp(`^<${tag}\\b[^>]*\\/>`, 'i'))
    if (selfClose) {
      out.push(selfClose[0])
      i = lt + selfClose[0].length
      continue
    }
    const openEnd = src.indexOf('>', lt)
    if (openEnd < 0) break
    const close = `</${tag}>`
    // Find matching close at same nesting depth (simple counter).
    let depth = 1
    let cursor = openEnd + 1
    while (cursor < src.length && depth > 0) {
      const nextOpen = src.indexOf(`<${tag}`, cursor)
      const nextClose = src.toLowerCase().indexOf(close.toLowerCase(), cursor)
      if (nextClose < 0) {
        cursor = src.length
        break
      }
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const after = src[nextOpen + tag.length + 1]
        if (after === '>' || after === ' ' || after === '/' || after === '\n' || after === '\t') {
          depth += 1
          cursor = nextOpen + tag.length + 1
          continue
        }
      }
      depth -= 1
      if (depth === 0) {
        out.push(src.slice(lt, nextClose + close.length))
        i = nextClose + close.length
        break
      }
      cursor = nextClose + close.length
    }
    if (depth !== 0) {
      i = openEnd + 1
    }
  }
  return out
}

/**
 * Best-effort clipitem sidecar: every top-level child we do not regenerate,
 * falling back to a whitelist of known Premiere extras.
 */
export function extractPremiereClipSidecar(clipItemBody: string): string | null {
  const elements = extractTopLevelXmlElements(clipItemBody)
  const residual = elements.filter((el) => {
    const tag = (el.match(/^<\/?([A-Za-z_][\w.-]*)/) || [])[1]?.toLowerCase()
    if (!tag) return false
    return !MANAGED_CLIPITEM_TAGS.has(tag)
  })
  if (residual.length) return truncate(residual.join('\n'))

  const blocks: string[] = []
  let m
  const re = new RegExp(CLIP_SIDECAR_TAG_RE.source, CLIP_SIDECAR_TAG_RE.flags)
  while ((m = re.exec(String(clipItemBody || '')))) {
    blocks.push(m[0].trim())
  }
  return truncate(blocks.join('\n'))
}

/** @deprecated Prefer extractPremiereClipSidecar — kept for callers/tests. */
export function extractPremiereFilterBlocks(clipItemBody: string): string | null {
  const blocks: string[] = []
  const re = /<filter\b[\s\S]*?<\/filter>/gi
  let m
  while ((m = re.exec(String(clipItemBody || '')))) {
    blocks.push(m[0].trim())
  }
  return sanitizePremiereClipSidecarXml(blocks.join('\n'))
}

export function sanitizePremiereClipSidecarXml(raw: string | null | undefined): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  if (/<\s*script\b/i.test(text)) return null
  if (text.length > MAX_SIDECAR_CHARS) return text.slice(0, MAX_SIDECAR_CHARS)
  return text
}

/** @deprecated alias */
export function sanitizePremiereFiltersXml(raw: string | null | undefined): string | null {
  return sanitizePremiereClipSidecarXml(raw)
}

/**
 * Track-level extras after removing clipitems (transitions, generators, titles…).
 */
export function extractPremiereTrackSidecar(trackBody: string): string | null {
  let rest = String(trackBody || '')
  rest = rest.replace(/<clipitem\b[\s\S]*?<\/clipitem>/gi, '')
  // Drop empty/default track name we rewrite.
  rest = rest.replace(/<name>\s*V1\s*<\/name>/i, '')
  rest = rest.replace(/<name>\s*Video\s*1\s*<\/name>/i, '')
  rest = rest.trim()
  if (!rest) {
    // Still collect transitions/generators if strip left whitespace only
    const blocks: string[] = []
    let m
    const tre = new RegExp(TRANSITION_RE.source, TRANSITION_RE.flags)
    while ((m = tre.exec(String(trackBody || '')))) blocks.push(m[0].trim())
    const gre = new RegExp(GENERATOR_RE.source, GENERATOR_RE.flags)
    while ((m = gre.exec(String(trackBody || '')))) blocks.push(m[0].trim())
    return truncate(blocks.join('\n'))
  }
  return truncate(rest)
}

/**
 * Sequence-level markers / labels outside <media>.
 */
export function extractPremiereSequenceExtras(xml: string): string | null {
  const seq = String(xml || '').match(/<sequence\b[^>]*>([\s\S]*?)<\/sequence>/i)
  if (!seq) return null
  let body = seq[1]
  body = body.replace(/<media\b[\s\S]*?<\/media>/i, '')
  body = body.replace(/<name>[\s\S]*?<\/name>/i, '')
  body = body.replace(/<rate>[\s\S]*?<\/rate>/i, '')
  body = body.replace(/<duration>[\s\S]*?<\/duration>/i, '')
  body = body.replace(/<timecode>[\s\S]*?<\/timecode>/i, '')
  body = body.replace(/<media\b[\s\S]*$/i, '')
  return truncate(body)
}
