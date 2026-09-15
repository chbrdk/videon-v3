/**
 * Client-safe model recommendation (no runtime-config / env).
 * Spec: specs/domain/media-generative-edit.md · knowledge/ai-clip-generation.md
 */

export type RecommendEditInput = {
  prompt: string
  /** Prefer Aleph when catalog exposes it as enabled */
  alephAvailable?: boolean
  /** Prefer MiniMax H3 when available in UI catalog */
  minimaxAvailable?: boolean
}

/**
 * Rule-based edit model pick. No LLM.
 * Default → MiniMax H3 Edit (Seedance V2V blocked on OpenRouter duration=-1).
 * Keyframe → Aleph when available.
 */
export function recommendEditModelId(input: RecommendEditInput): string {
  const prompt = input.prompt.trim().toLowerCase()
  if (!prompt) return 'minimax_hailuo_3_edit'

  const wantsKeyframe =
    /\b(keyframe|key frame|exact frame|pixel.?perfect|frame.?guided|präzise|exakt)\b/i.test(prompt) ||
    /\b(aleph)\b/i.test(prompt)
  if (wantsKeyframe && input.alephAvailable) return 'runway_aleph_2'

  // Explicit Seedance ask still maps to MiniMax until OpenRouter supports duration=-1.
  if (/\b(seedance)\b/i.test(prompt)) return 'minimax_hailuo_3_edit'

  const wantsMinimax =
    /\b(minimax|hailuo|h3|brand.?text|logo.?text|motion.?transfer|typografie|schrift)\b/i.test(prompt)
  if (wantsMinimax && input.minimaxAvailable !== false) return 'minimax_hailuo_3_edit'

  return 'minimax_hailuo_3_edit'
}

export function recommendCreateModelId(prompt: string): string {
  const p = prompt.trim().toLowerCase()
  if (/\b(photoreal|cinematic|hero|4k|photorealistic|filmisch|veo\s*3\.1(?!\s*lite))\b/i.test(p)) {
    return 'veo_3_1_create'
  }
  if (/\b(veo\s*lite|veo.?3\.1.?lite|cheap.?veo|volume.?create)\b/i.test(p)) {
    return 'veo_3_1_lite_create'
  }
  if (/\b(minimax|hailuo|h3.?max|fast.?create)\b/i.test(p)) return 'minimax_hailuo_3_create'
  if (/\b(wan|alibaba|1080p|long.?clip|story)\b/i.test(p)) return 'wan_3_0_create'
  return 'seedance_2_5_t2v'
}
