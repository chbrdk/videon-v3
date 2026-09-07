export const SCENE_INSIGHT_SCHEMA_VERSION_V1 = 'videon.scene-insight.v1' as const
export const SCENE_INSIGHT_SCHEMA_VERSION = 'videon.scene-insight.v2' as const
export const SCENE_ANALYSIS_PROMPT_VERSION = 'videon.scene-analysis-prompt.v2' as const

export const OBJECT_CATEGORIES = [
  'vehicle',
  'product',
  'prop',
  'animal',
  'text_on_screen',
  'other',
] as const

export const APPARENT_AGE_RANGES = [
  'child',
  'teen',
  'young_adult',
  'middle_adult',
  'older_adult',
  'unknown',
] as const

export const BRAND_CANDIDATE_KINDS = [
  'logo_or_wordmark',
  'product_name',
  'packaging',
  'other',
] as const

export const BRAND_CONFIDENCE = ['possible', 'likely', 'clear'] as const

export const OBSERVED_VS_INFERRED = [
  'observed_primary',
  'mixed',
  'inferred_heavy',
] as const

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number]
export type ApparentAgeRange = (typeof APPARENT_AGE_RANGES)[number]
export type BrandCandidateKind = (typeof BRAND_CANDIDATE_KINDS)[number]
export type BrandConfidence = (typeof BRAND_CONFIDENCE)[number]
export type ObservedVsInferred = (typeof OBSERVED_VS_INFERRED)[number]

export type SceneInsightObject = {
  id: string
  label: string
  category: ObjectCategory
  attributes: string[]
  count: number
  evidenceFrameIds: string[]
}

export type SceneInsightPerson = {
  id: string
  count: number
  apparentAgeRange: ApparentAgeRange
  apparentPresentation: string[]
  role: string
  evidenceFrameIds: string[]
}

export type SceneInsightAction = {
  label: string
  startMs: number
  endMs: number
  actorIds: string[]
  evidenceFrameIds: string[]
}

export type SceneInsightBrandCandidate = {
  text: string
  kind: BrandCandidateKind
  objectId: string | null
  evidenceFrameIds: string[]
  confidence: BrandConfidence
}

export type SceneInsight = {
  schemaVersion: typeof SCENE_INSIGHT_SCHEMA_VERSION
  summary: string
  objects: SceneInsightObject[]
  people: SceneInsightPerson[]
  setting: {
    location: string
    timeOfDay: string
    environment: string[]
    details: string[]
  }
  composition: {
    shotType: string
    cameraMotion: string
    dominantColors: string[]
  }
  actions: SceneInsightAction[]
  brandCandidates: SceneInsightBrandCandidate[]
  mood: string[]
  notableDetails: Array<{ text: string; evidenceFrameIds: string[] }>
  safetyFlags: string[]
  observedVsInferred: ObservedVsInferred
}

/** Legacy v1 shape still readable from stored rows. */
export type SceneInsightV1 = {
  schemaVersion: typeof SCENE_INSIGHT_SCHEMA_VERSION_V1
  summary: string
  subjects: Array<{ label: string; attributes: string[]; evidenceFrameIds: string[] }>
  actions: Array<{ label: string; startMs: number; endMs: number; evidenceFrameIds: string[] }>
  setting: { location: string; timeOfDay: string; details: string[] }
  mood: string[]
  notableDetails: Array<{ text: string; evidenceFrameIds: string[] }>
  safetyFlags: string[]
}

export type SceneInsightAny = SceneInsight | SceneInsightV1

export const sceneInsightJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'summary',
    'objects',
    'people',
    'setting',
    'composition',
    'actions',
    'brandCandidates',
    'mood',
    'notableDetails',
    'safetyFlags',
    'observedVsInferred',
  ],
  properties: {
    schemaVersion: { type: 'string', const: SCENE_INSIGHT_SCHEMA_VERSION },
    summary: { type: 'string', minLength: 1, maxLength: 400 },
    objects: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'category', 'attributes', 'count', 'evidenceFrameIds'],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          label: { type: 'string', minLength: 1, maxLength: 80 },
          category: { type: 'string', enum: [...OBJECT_CATEGORIES] },
          attributes: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },
          count: { type: 'integer', minimum: 1, maximum: 99 },
          evidenceFrameIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    people: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'count',
          'apparentAgeRange',
          'apparentPresentation',
          'role',
          'evidenceFrameIds',
        ],
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 40 },
          count: { type: 'integer', minimum: 1, maximum: 99 },
          apparentAgeRange: { type: 'string', enum: [...APPARENT_AGE_RANGES] },
          apparentPresentation: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },
          role: { type: 'string', minLength: 1, maxLength: 40 },
          evidenceFrameIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    setting: {
      type: 'object',
      additionalProperties: false,
      required: ['location', 'timeOfDay', 'environment', 'details'],
      properties: {
        location: { type: 'string', minLength: 1, maxLength: 80 },
        timeOfDay: { type: 'string', minLength: 1, maxLength: 40 },
        environment: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', minLength: 1, maxLength: 40 },
        },
        details: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', minLength: 1, maxLength: 80 },
        },
      },
    },
    composition: {
      type: 'object',
      additionalProperties: false,
      required: ['shotType', 'cameraMotion', 'dominantColors'],
      properties: {
        shotType: { type: 'string', minLength: 1, maxLength: 40 },
        cameraMotion: { type: 'string', minLength: 1, maxLength: 40 },
        dominantColors: {
          type: 'array',
          maxItems: 6,
          items: { type: 'string', minLength: 1, maxLength: 30 },
        },
      },
    },
    actions: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'startMs', 'endMs', 'actorIds', 'evidenceFrameIds'],
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 80 },
          startMs: { type: 'integer', minimum: 0 },
          endMs: { type: 'integer', minimum: 0 },
          actorIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 40 },
          },
          evidenceFrameIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    brandCandidates: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'kind', 'objectId', 'evidenceFrameIds', 'confidence'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 80 },
          kind: { type: 'string', enum: [...BRAND_CANDIDATE_KINDS] },
          objectId: { type: ['string', 'null'], maxLength: 40 },
          evidenceFrameIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
          confidence: { type: 'string', enum: [...BRAND_CONFIDENCE] },
        },
      },
    },
    mood: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 40 },
    },
    notableDetails: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidenceFrameIds'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 160 },
          evidenceFrameIds: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 80 },
          },
        },
      },
    },
    safetyFlags: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    observedVsInferred: { type: 'string', enum: [...OBSERVED_VS_INFERRED] },
  },
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function asStringArray(value: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const out: string[] = []
  for (const item of value) {
    const s = asString(item, maxLen)
    if (!s) return null
    out.push(s)
  }
  return out
}

function asInt(value: unknown, min: number, max?: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) return null
  if (max !== undefined && value > max) return null
  return value
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function parseEvidence(value: unknown, allowedFrameIds?: ReadonlySet<string>): string[] | null {
  const ids = asStringArray(value, 8, 80)
  if (!ids) return null
  if (!allowedFrameIds) return ids
  return ids.filter((id) => allowedFrameIds.has(id))
}

export function parseSceneInsight(
  value: unknown,
  allowedFrameIds?: readonly string[],
): SceneInsight | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== SCENE_INSIGHT_SCHEMA_VERSION) return null
  const allowed = allowedFrameIds ? new Set(allowedFrameIds) : undefined

  const summary = asString(value.summary, 400)
  if (!summary) return null

  if (!Array.isArray(value.objects) || value.objects.length > 16) return null
  const objects: SceneInsightObject[] = []
  for (const item of value.objects) {
    if (!isRecord(item)) return null
    const id = asString(item.id, 40)
    const label = asString(item.label, 80)
    const category = asEnum(item.category, OBJECT_CATEGORIES)
    const attributes = asStringArray(item.attributes, 8, 40)
    const count = asInt(item.count, 1, 99)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds, allowed)
    if (!id || !label || !category || !attributes || count === null || !evidenceFrameIds) return null
    objects.push({ id, label, category, attributes, count, evidenceFrameIds })
  }

  if (!Array.isArray(value.people) || value.people.length > 12) return null
  const people: SceneInsightPerson[] = []
  for (const item of value.people) {
    if (!isRecord(item)) return null
    const id = asString(item.id, 40)
    const count = asInt(item.count, 1, 99)
    const apparentAgeRange = asEnum(item.apparentAgeRange, APPARENT_AGE_RANGES)
    const apparentPresentation = asStringArray(item.apparentPresentation, 8, 40)
    const role = asString(item.role, 40)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds, allowed)
    if (
      !id ||
      count === null ||
      !apparentAgeRange ||
      !apparentPresentation ||
      !role ||
      !evidenceFrameIds
    ) {
      return null
    }
    people.push({ id, count, apparentAgeRange, apparentPresentation, role, evidenceFrameIds })
  }

  if (!isRecord(value.setting)) return null
  const location = asString(value.setting.location, 80)
  const timeOfDay = asString(value.setting.timeOfDay, 40)
  const environment = asStringArray(value.setting.environment, 8, 40)
  const settingDetails = asStringArray(value.setting.details, 8, 80)
  if (!location || !timeOfDay || !environment || !settingDetails) return null

  if (!isRecord(value.composition)) return null
  const shotType = asString(value.composition.shotType, 40)
  const cameraMotion = asString(value.composition.cameraMotion, 40)
  const dominantColors = asStringArray(value.composition.dominantColors, 6, 30)
  if (!shotType || !cameraMotion || !dominantColors) return null

  if (!Array.isArray(value.actions) || value.actions.length > 12) return null
  const actions: SceneInsightAction[] = []
  for (const item of value.actions) {
    if (!isRecord(item)) return null
    const label = asString(item.label, 80)
    const startMs = asInt(item.startMs, 0)
    const endMs = asInt(item.endMs, 0)
    const actorIds = asStringArray(item.actorIds, 8, 40)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds, allowed)
    if (!label || startMs === null || endMs === null || !actorIds || !evidenceFrameIds) return null
    if (endMs < startMs) return null
    actions.push({ label, startMs, endMs, actorIds, evidenceFrameIds })
  }

  if (!Array.isArray(value.brandCandidates) || value.brandCandidates.length > 12) return null
  const brandCandidates: SceneInsightBrandCandidate[] = []
  for (const item of value.brandCandidates) {
    if (!isRecord(item)) return null
    const text = asString(item.text, 80)
    const kind = asEnum(item.kind, BRAND_CANDIDATE_KINDS)
    const confidence = asEnum(item.confidence, BRAND_CONFIDENCE)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds, allowed)
    const objectId =
      item.objectId === null || item.objectId === undefined
        ? null
        : asString(item.objectId, 40)
    if (!text || !kind || !confidence || !evidenceFrameIds) return null
    if (item.objectId !== null && item.objectId !== undefined && objectId === null) return null
    brandCandidates.push({ text, kind, objectId, evidenceFrameIds, confidence })
  }

  const mood = asStringArray(value.mood, 8, 40)
  if (!mood) return null

  if (!Array.isArray(value.notableDetails) || value.notableDetails.length > 12) return null
  const notableDetails: Array<{ text: string; evidenceFrameIds: string[] }> = []
  for (const item of value.notableDetails) {
    if (!isRecord(item)) return null
    const text = asString(item.text, 160)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds, allowed)
    if (!text || !evidenceFrameIds) return null
    notableDetails.push({ text, evidenceFrameIds })
  }

  const safetyFlags = asStringArray(value.safetyFlags, 8, 80)
  if (!safetyFlags) return null

  const observedVsInferred = asEnum(value.observedVsInferred, OBSERVED_VS_INFERRED)
  if (!observedVsInferred) return null

  return {
    schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION,
    summary,
    objects,
    people,
    setting: { location, timeOfDay, environment, details: settingDetails },
    composition: { shotType, cameraMotion, dominantColors },
    actions,
    brandCandidates,
    mood,
    notableDetails,
    safetyFlags,
    observedVsInferred,
  }
}

export function parseSceneInsightV1(value: unknown): SceneInsightV1 | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== SCENE_INSIGHT_SCHEMA_VERSION_V1) return null
  const summary = asString(value.summary, 400)
  if (!summary) return null
  if (!Array.isArray(value.subjects) || value.subjects.length > 16) return null
  const subjects: SceneInsightV1['subjects'] = []
  for (const item of value.subjects) {
    if (!isRecord(item)) return null
    const label = asString(item.label, 80)
    const attributes = asStringArray(item.attributes, 8, 40)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds)
    if (!label || !attributes || !evidenceFrameIds) return null
    subjects.push({ label, attributes, evidenceFrameIds })
  }
  if (!Array.isArray(value.actions) || value.actions.length > 12) return null
  const actions: SceneInsightV1['actions'] = []
  for (const item of value.actions) {
    if (!isRecord(item)) return null
    const label = asString(item.label, 80)
    const startMs = asInt(item.startMs, 0)
    const endMs = asInt(item.endMs, 0)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds)
    if (!label || startMs === null || endMs === null || !evidenceFrameIds) return null
    if (endMs < startMs) return null
    actions.push({ label, startMs, endMs, evidenceFrameIds })
  }
  if (!isRecord(value.setting)) return null
  const location = asString(value.setting.location, 80)
  const timeOfDay = asString(value.setting.timeOfDay, 40)
  const details = asStringArray(value.setting.details, 8, 80)
  if (!location || !timeOfDay || !details) return null
  const mood = asStringArray(value.mood, 8, 40)
  if (!mood) return null
  if (!Array.isArray(value.notableDetails) || value.notableDetails.length > 12) return null
  const notableDetails: SceneInsightV1['notableDetails'] = []
  for (const item of value.notableDetails) {
    if (!isRecord(item)) return null
    const text = asString(item.text, 160)
    const evidenceFrameIds = parseEvidence(item.evidenceFrameIds)
    if (!text || !evidenceFrameIds) return null
    notableDetails.push({ text, evidenceFrameIds })
  }
  const safetyFlags = asStringArray(value.safetyFlags, 8, 80)
  if (!safetyFlags) return null
  return {
    schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION_V1,
    summary,
    subjects,
    actions,
    setting: { location, timeOfDay, details },
    mood,
    notableDetails,
    safetyFlags,
  }
}

export function readSceneInsight(value: unknown): SceneInsightAny | null {
  return parseSceneInsight(value) ?? parseSceneInsightV1(value)
}

/** Normalize v1/v2 into the v2 view model for UI and search. */
export function toSceneInsightView(value: unknown): SceneInsight | null {
  const v2 = parseSceneInsight(value)
  if (v2) return v2
  const v1 = parseSceneInsightV1(value)
  if (!v1) return null
  return {
    schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION,
    summary: v1.summary,
    objects: v1.subjects.map((subject, index) => ({
      id: `legacy_obj_${index + 1}`,
      label: subject.label,
      category: 'other' as const,
      attributes: subject.attributes,
      count: 1,
      evidenceFrameIds: subject.evidenceFrameIds,
    })),
    people: [],
    setting: {
      location: v1.setting.location,
      timeOfDay: v1.setting.timeOfDay,
      environment: [],
      details: v1.setting.details,
    },
    composition: {
      shotType: 'unknown',
      cameraMotion: 'unknown',
      dominantColors: [],
    },
    actions: v1.actions.map((action) => ({
      ...action,
      actorIds: [],
    })),
    brandCandidates: [],
    mood: v1.mood,
    notableDetails: v1.notableDetails,
    safetyFlags: v1.safetyFlags,
    observedVsInferred: 'mixed',
  }
}

export function emptySceneInsight(summary = 'No visual insight available.'): SceneInsight {
  return {
    schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION,
    summary,
    objects: [],
    people: [],
    setting: { location: 'unknown', timeOfDay: 'unknown', environment: [], details: [] },
    composition: { shotType: 'unknown', cameraMotion: 'unknown', dominantColors: [] },
    actions: [],
    brandCandidates: [],
    mood: [],
    notableDetails: [],
    safetyFlags: [],
    observedVsInferred: 'observed_primary',
  }
}
