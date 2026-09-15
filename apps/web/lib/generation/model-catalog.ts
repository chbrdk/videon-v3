import {
  generationAlephModel,
  generationDraftModel,
  generationMinimaxEditModel,
  generationMinimaxModel,
  generationSeedanceModel,
  generationVeoLiteModel,
  generationVeoModel,
  generationWanModel,
} from '@/lib/runtime-config'

export type GenerationModelRole = 'edit' | 'create' | 'draft'

export type GenerationResolution = '480p' | '720p' | '768p' | '1080p' | '2K'

export type GenerationModelEntry = {
  id: string
  label: string
  role: GenerationModelRole
  /** OpenRouter model slug, e.g. bytedance/seedance-2.5 */
  providerModelId: string
  defaultResolution: GenerationResolution
  phase1Enabled: boolean
  /** Rough USD per generated second for UI estimates (operator guidance only). */
  usdPerSecond: number
  /** OpenRouter duration bounds (seconds). */
  durationMinSeconds?: number
  durationMaxSeconds?: number
}

/** Server-side catalog — UI lists ids/labels only. */
export function generationModelCatalog(): GenerationModelEntry[] {
  return [
    {
      id: 'seedance_2_5_edit',
      label: 'Seedance 2.5 Edit',
      role: 'edit',
      providerModelId: generationSeedanceModel(),
      defaultResolution: '720p',
      phase1Enabled: true,
      usdPerSecond: 0.12,
      durationMinSeconds: 4,
      durationMaxSeconds: 30,
    },
    {
      id: 'minimax_hailuo_3_edit',
      label: 'MiniMax H3 Edit',
      role: 'edit',
      providerModelId: generationMinimaxEditModel(),
      defaultResolution: '2K',
      phase1Enabled: true,
      usdPerSecond: 0.13,
      durationMinSeconds: 5,
      durationMaxSeconds: 15,
    },
    {
      id: 'runway_aleph_2',
      label: 'Runway Aleph 2.0 (keyframe)',
      role: 'edit',
      providerModelId: generationAlephModel() || 'runway/aleph-2',
      defaultResolution: '720p',
      phase1Enabled: Boolean(generationAlephModel()),
      usdPerSecond: 0.28,
    },
    {
      id: 'happy_horse_draft',
      label: 'Draft (480p Seedance)',
      role: 'draft',
      providerModelId: generationDraftModel(),
      defaultResolution: '480p',
      phase1Enabled: true,
      usdPerSecond: 0.05,
      durationMinSeconds: 4,
      durationMaxSeconds: 30,
    },
    {
      id: 'seedance_2_5_t2v',
      label: 'Seedance 2.5 Text-to-Video',
      role: 'create',
      providerModelId: generationSeedanceModel(),
      defaultResolution: '720p',
      phase1Enabled: true,
      usdPerSecond: 0.1,
      durationMinSeconds: 4,
      durationMaxSeconds: 30,
    },
    {
      id: 'wan_3_0_create',
      label: 'Wan 3.0',
      role: 'create',
      providerModelId: generationWanModel(),
      defaultResolution: '720p',
      phase1Enabled: true,
      usdPerSecond: 0.085,
      durationMinSeconds: 2,
      durationMaxSeconds: 30,
    },
    {
      id: 'minimax_hailuo_3_create',
      label: 'MiniMax H3 Max',
      role: 'create',
      providerModelId: generationMinimaxModel(),
      defaultResolution: '768p',
      phase1Enabled: true,
      usdPerSecond: 0.08,
      durationMinSeconds: 5,
      durationMaxSeconds: 15,
    },
    {
      id: 'veo_3_1_lite_create',
      label: 'Veo 3.1 Lite',
      role: 'create',
      providerModelId: generationVeoLiteModel(),
      defaultResolution: '720p',
      phase1Enabled: true,
      usdPerSecond: 0.2,
      durationMinSeconds: 4,
      durationMaxSeconds: 8,
    },
    {
      id: 'veo_3_1_create',
      label: 'Veo 3.1',
      role: 'create',
      providerModelId: generationVeoModel(),
      defaultResolution: '720p',
      phase1Enabled: true,
      usdPerSecond: 0.4,
      durationMinSeconds: 4,
      durationMaxSeconds: 8,
    },
  ]
}

export function findGenerationModel(modelId: string): GenerationModelEntry | null {
  return generationModelCatalog().find((entry) => entry.id === modelId) ?? null
}

export function resolveEditModel(modelId: string | undefined | null): GenerationModelEntry | null {
  const id = (modelId || 'seedance_2_5_edit').trim()
  const entry = findGenerationModel(id)
  if (!entry || !entry.phase1Enabled) return null
  if (entry.role === 'create') return null
  return entry
}

export function resolveCreateModel(modelId: string | undefined | null): GenerationModelEntry | null {
  const id = (modelId || 'seedance_2_5_t2v').trim()
  const entry = findGenerationModel(id)
  if (!entry || !entry.phase1Enabled || entry.role !== 'create') return null
  return entry
}

export function resolveDraftModel(preferredId?: string | null): GenerationModelEntry {
  const preferred = preferredId ? findGenerationModel(preferredId) : null
  if (preferred?.role === 'draft' && preferred.phase1Enabled) return preferred
  const draft = findGenerationModel('happy_horse_draft')
  if (draft) return draft
  return {
    id: 'seedance_2_5_edit',
    label: 'Seedance 2.5 Edit',
    role: 'edit',
    providerModelId: generationSeedanceModel(),
    defaultResolution: '480p',
    phase1Enabled: true,
    usdPerSecond: 0.05,
    durationMinSeconds: 4,
    durationMaxSeconds: 30,
  }
}

export function clampGenerationDurationSeconds(
  seconds: number,
  model?: GenerationModelEntry | null,
): number {
  const min = model?.durationMinSeconds ?? 4
  const max = model?.durationMaxSeconds ?? 30
  if (!Number.isFinite(seconds)) return Math.max(min, Math.min(max, 5))
  return Math.max(min, Math.min(max, Math.round(seconds)))
}

export function buildQualityLockedPrompt(userPrompt: string): string {
  const trimmed = userPrompt.trim()
  return [
    `edit: ${trimmed}`,
    'Preserve the original camera motion, framing, lighting, background, and people.',
    'Change only what the edit instruction requires. Keep temporal continuity with the source video.',
  ].join(' ')
}

export function estimateGenerationCostUsd(input: {
  modelId: string
  durationSeconds: number
  skipDraft?: boolean
}): { draftUsd: number; finalUsd: number; totalUsd: number } {
  const model = findGenerationModel(input.modelId)
  const draft = resolveDraftModel()
  const seconds = Math.max(1, input.durationSeconds)
  const finalUsd = Number(((model?.usdPerSecond ?? 0.12) * seconds).toFixed(2))
  const draftUsd = input.skipDraft
    ? 0
    : Number((draft.usdPerSecond * seconds).toFixed(2))
  return { draftUsd, finalUsd, totalUsd: Number((draftUsd + finalUsd).toFixed(2)) }
}

export function publicGenerationModelsForUi(
  role: 'edit' | 'create' = 'edit',
): Array<{ id: string; label: string; role: GenerationModelRole; usdPerSecond: number }> {
  return generationModelCatalog()
    .filter((entry) => {
      if (!entry.phase1Enabled) return false
      if (role === 'edit') return entry.role === 'edit' || entry.role === 'draft'
      return entry.role === 'create'
    })
    .map(({ id, label, role: r, usdPerSecond }) => ({ id, label, role: r, usdPerSecond }))
}
