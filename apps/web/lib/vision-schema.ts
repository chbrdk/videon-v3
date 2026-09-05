export const SCENE_INSIGHT_SCHEMA_VERSION = 'videon.scene-insight.v1' as const

export type SceneInsight = {
  schemaVersion: typeof SCENE_INSIGHT_SCHEMA_VERSION
  summary: string
  subjects: Array<{ label: string; attributes: string[]; evidenceFrameIds: string[] }>
  actions: Array<{ label: string; startMs: number; endMs: number; evidenceFrameIds: string[] }>
  setting: { location: string; timeOfDay: string; details: string[] }
  mood: string[]
  notableDetails: Array<{ text: string; evidenceFrameIds: string[] }>
  safetyFlags: string[]
}

/** Provider-facing fallback schema. The Flash lane still validates against `parseSceneInsight`. */
export const sceneInsightJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'summary', 'subjects', 'actions', 'setting', 'mood', 'notableDetails', 'safetyFlags'],
  properties: {
    schemaVersion: { type: 'string', const: SCENE_INSIGHT_SCHEMA_VERSION },
    summary: { type: 'string', maxLength: 1200 },
    subjects: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'attributes', 'evidenceFrameIds'],
        properties: {
          label: { type: 'string', maxLength: 120 },
          attributes: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 120 } },
          evidenceFrameIds: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 128 } },
        },
      },
    },
    actions: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'startMs', 'endMs', 'evidenceFrameIds'],
        properties: {
          label: { type: 'string', maxLength: 120 },
          startMs: { type: 'number', minimum: 0 },
          endMs: { type: 'number', minimum: 0 },
          evidenceFrameIds: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 128 } },
        },
      },
    },
    setting: {
      type: 'object',
      additionalProperties: false,
      required: ['location', 'timeOfDay', 'details'],
      properties: {
        location: { type: 'string', maxLength: 240 },
        timeOfDay: { type: 'string', maxLength: 120 },
        details: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 240 } },
      },
    },
    mood: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 120 } },
    notableDetails: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'evidenceFrameIds'],
        properties: {
          text: { type: 'string', maxLength: 240 },
          evidenceFrameIds: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 128 } },
        },
      },
    },
    safetyFlags: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 120 } },
  },
} as const

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function sanitizeEvidenceIds(value: unknown, validFrameIds: Set<string>): string[] {
  if (!isStringArray(value)) return []
  return value.filter((id) => validFrameIds.has(id))
}

/**
 * Qwen3.7 Flash supports JSON output but not provider-enforced JSON Schema.
 * Successful output therefore always passes this executable contract before persistence.
 */
export function parseSceneInsight(value: unknown, frameIds: readonly string[]): SceneInsight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const validFrameIds = new Set(frameIds)
  if (record.schemaVersion !== SCENE_INSIGHT_SCHEMA_VERSION || typeof record.summary !== 'string') return null
  if (!Array.isArray(record.subjects) || !Array.isArray(record.actions) || !Array.isArray(record.notableDetails)) return null
  if (!record.setting || typeof record.setting !== 'object' || Array.isArray(record.setting)) return null
  const setting = record.setting as Record<string, unknown>
  if (
    typeof setting.location !== 'string' ||
    typeof setting.timeOfDay !== 'string' ||
    !isStringArray(setting.details) ||
    !isStringArray(record.mood) ||
    !isStringArray(record.safetyFlags)
  ) {
    return null
  }

  const subjects = [] as SceneInsight['subjects']
  for (const raw of record.subjects) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const item = raw as Record<string, unknown>
    if (typeof item.label !== 'string' || !isStringArray(item.attributes)) return null
    subjects.push({
      label: item.label,
      attributes: item.attributes,
      evidenceFrameIds: sanitizeEvidenceIds(item.evidenceFrameIds, validFrameIds),
    })
  }

  const actions = [] as SceneInsight['actions']
  for (const raw of record.actions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const item = raw as Record<string, unknown>
    if (
      typeof item.label !== 'string' ||
      typeof item.startMs !== 'number' ||
      typeof item.endMs !== 'number' ||
      item.startMs < 0 ||
      item.endMs < item.startMs
    ) {
      return null
    }
    actions.push({
      label: item.label,
      startMs: item.startMs,
      endMs: item.endMs,
      evidenceFrameIds: sanitizeEvidenceIds(item.evidenceFrameIds, validFrameIds),
    })
  }

  const notableDetails = [] as SceneInsight['notableDetails']
  for (const raw of record.notableDetails) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const item = raw as Record<string, unknown>
    if (typeof item.text !== 'string') return null
    notableDetails.push({
      text: item.text,
      evidenceFrameIds: sanitizeEvidenceIds(item.evidenceFrameIds, validFrameIds),
    })
  }

  return {
    schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION,
    summary: record.summary,
    subjects,
    actions,
    setting: { location: setting.location, timeOfDay: setting.timeOfDay, details: setting.details },
    mood: record.mood,
    notableDetails,
    safetyFlags: record.safetyFlags,
  }
}
