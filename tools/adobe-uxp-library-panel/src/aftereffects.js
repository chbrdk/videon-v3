/**
 * After Effects host adapter stub (Wave 1.5).
 * Spec: adobe-uxp-library-panel.md — port Legacy ae.ts patterns when AE host is added to manifest.
 */

import { sceneInOutFrames } from './time.js'
import { assertLocalImportPath } from './premiere-path.js'

async function getAeApi() {
  try {
    // AE UXP module id may vary by Adobe version; Wave 1.5 locks the import.
    return await import('aeft')
  } catch {
    try {
      return await import('aftereffects')
    } catch {
      return null
    }
  }
}

/**
 * @param {{ filePath: string, compName: string, hit: object, sequential: boolean, gapFrames: number }} input
 */
export async function insertHitIntoAfterEffects(input) {
  const { filePath, compName, hit, sequential, gapFrames } = input
  const localPath = assertLocalImportPath(filePath)
  const ae = await getAeApi()

  if (!ae) {
    return {
      ok: true,
      mode: 'stub',
      message: `AE Host noch nicht verdrahtet — Datei bereit: ${localPath}`,
      preview: {
        compName: compName || 'VIDEON',
        inOut: sceneInOutFrames(hit, 25),
        sequential: Boolean(sequential),
        gapFrames: Number(gapFrames) || 0,
      },
    }
  }

  return {
    ok: false,
    mode: 'unsupported',
    message: 'AE-Adapter Wave 1.5: Comp-Insert noch nicht implementiert',
  }
}
