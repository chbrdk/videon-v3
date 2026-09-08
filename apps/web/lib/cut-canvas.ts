/** Cut export canvas presets — specs/domain/cut-export-extras.md */

export type CutAspectPreset = '9:16' | '16:9' | '1:1' | 'custom'

export const CUT_ASPECT_PRESETS: CutAspectPreset[] = ['9:16', '16:9', '1:1', 'custom']

export const CUT_ASPECT_PRESET_PIXELS: Record<
  Exclude<CutAspectPreset, 'custom'>,
  { width: number; height: number }
> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
}

export const CUT_CANVAS_DEFAULT_FPS = 25
export const CUT_CANVAS_MAX_EDGE = 3840

export function isCutAspectPreset(value: string): value is CutAspectPreset {
  return (CUT_ASPECT_PRESETS as string[]).includes(value)
}

function isEvenPositive(n: number): boolean {
  return Number.isInteger(n) && n >= 2 && n <= CUT_CANVAS_MAX_EDGE && n % 2 === 0
}

export function resolveCutCanvas(input: {
  aspectPreset: string
  width?: unknown
  height?: unknown
}): { ok: true; width: number; height: number; aspectPreset: CutAspectPreset } | { ok: false; message: string } {
  if (!isCutAspectPreset(input.aspectPreset)) {
    return { ok: false, message: 'aspectPreset must be 9:16, 16:9, 1:1, or custom' }
  }
  if (input.aspectPreset !== 'custom') {
    const pixels = CUT_ASPECT_PRESET_PIXELS[input.aspectPreset]
    return { ok: true, width: pixels.width, height: pixels.height, aspectPreset: input.aspectPreset }
  }
  const width = typeof input.width === 'number' ? input.width : Number.NaN
  const height = typeof input.height === 'number' ? input.height : Number.NaN
  if (!isEvenPositive(width) || !isEvenPositive(height)) {
    return {
      ok: false,
      message: `custom width/height must be even integers between 2 and ${CUT_CANVAS_MAX_EDGE}`,
    }
  }
  return { ok: true, width, height, aspectPreset: 'custom' }
}

export type CutExportFormat = 'mp4' | 'premiere_xml'

export function isCutExportFormat(value: string): value is CutExportFormat {
  return value === 'mp4' || value === 'premiere_xml'
}
