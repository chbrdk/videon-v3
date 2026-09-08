/**
 * Natural-language → scene search plan.
 * plainto_tsquery ANDs every token (incl. “ich suche eine Szene …”) and fails NL chat.
 */

const STOPWORDS = new Set(
  [
    // de
    'ich',
    'du',
    'wir',
    'suche',
    'suchen',
    'such',
    'finde',
    'finden',
    'zeig',
    'zeige',
    'zeigen',
    'bitte',
    'nach',
    'ein',
    'eine',
    'einer',
    'eines',
    'einen',
    'der',
    'die',
    'das',
    'dem',
    'den',
    'des',
    'und',
    'oder',
    'mit',
    'für',
    'von',
    'zu',
    'im',
    'in',
    'am',
    'an',
    'auf',
    'aus',
    'ist',
    'sind',
    'wie',
    'was',
    'wo',
    'welche',
    'welcher',
    'welches',
    'szene',
    'szenen',
    'video',
    'videos',
    'clip',
    'darstellt',
    'darstellen',
    'zeigt',
    'zeigend',
    'enthalt',
    'enthält',
    'enthaltend',
    // en
    'i',
    'a',
    'an',
    'the',
    'and',
    'or',
    'for',
    'to',
    'of',
    'in',
    'on',
    'at',
    'is',
    'are',
    'that',
    'this',
    'with',
    'find',
    'search',
    'looking',
    'show',
    'shows',
    'showing',
    'depicts',
    'depicting',
    'scene',
    'scenes',
    'video',
    'videos',
    'clip',
    'me',
    'my',
  ].map((w) => w.toLowerCase()),
)

/** Concept expansions — NL “dashboard / web UI” → indexed vision vocabulary. */
const CONCEPT_EXPANSIONS: Array<{ match: RegExp; terms: string[] }> = [
  {
    match: /dashb|dashboard|widget|kpi|chart|graph|analytics|statistik|kennzah/i,
    terms: [
      'dashboard',
      'dashboards',
      'ui',
      'interface',
      'interfaces',
      'screen',
      'screens',
      'monitor',
      'software',
      'app',
      'web',
      'website',
      'browser',
      'chart',
      'charts',
      'graph',
      'graphs',
      'widget',
      'widgets',
      'panel',
      'panels',
      'analytics',
      'data',
      'table',
      'tables',
    ],
  },
  {
    match: /\bui\b|interface|interfaces|gui|frontend|bildschirm|screen|website|webapp|web\s*app/i,
    terms: [
      'ui',
      'interface',
      'interfaces',
      'gui',
      'screen',
      'screens',
      'monitor',
      'display',
      'software',
      'app',
      'application',
      'web',
      'website',
      'browser',
      'laptop',
      'computer',
      'desktop',
    ],
  },
]

export type SceneSearchPlan = {
  /** Original operator input */
  raw: string
  /** Terms used for ranking / empty-state copy */
  terms: string[]
  /** Postgres `to_tsquery('simple', …)` OR of `term:*` — null if none */
  tsQuery: string | null
  /** ILIKE patterns `%term%` fallback / typo tolerance */
  likePatterns: string[]
}

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, '')
}

function expandConcepts(raw: string, seeds: string[]): string[] {
  const out = new Set(seeds)
  for (const rule of CONCEPT_EXPANSIONS) {
    if (rule.match.test(raw) || seeds.some((s) => rule.match.test(s))) {
      for (const term of rule.terms) out.add(term)
    }
  }
  // Typo: dashbaords → still hit dashboard expansion via /dashb/
  if (/dashb/i.test(raw)) {
    for (const term of CONCEPT_EXPANSIONS[0].terms) out.add(term)
  }
  return [...out]
}

function toTsQueryOr(terms: string[]): string | null {
  const parts = terms
    .map((term) => term.replace(/[^a-z0-9]/gi, ''))
    .filter((term) => term.length >= 2)
    .map((term) => `${term}:*`)
  if (!parts.length) return null
  // Cap OR fan-out for planner safety
  return [...new Set(parts)].slice(0, 24).join(' | ')
}

/**
 * Build a retrieval plan from chat / search NL input.
 */
export function buildSceneSearchPlan(rawInput: string): SceneSearchPlan {
  const raw = rawInput.trim()
  if (!raw) {
    return { raw: '', terms: [], tsQuery: null, likePatterns: [] }
  }

  const tokens = raw
    .split(/\s+/u)
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))

  const expanded = expandConcepts(raw, tokens)
  const terms = expanded.filter((term) => term.length >= 2).slice(0, 24)
  const tsQuery = toTsQueryOr(terms)
  const likePatterns = terms
    .filter((term) => term.length >= 3)
    .slice(0, 12)
    .map((term) => `%${term}%`)

  return { raw, terms, tsQuery, likePatterns }
}
