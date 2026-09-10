/**
 * After Effects host adapter (Wave 1.5).
 * Spec: adobe-uxp-library-panel.md
 *
 * Prefer ExtendScript-style `app.project` when the host exposes it.
 * Public AE UXP DOM APIs are still pending Adobe — without either path we
 * return an explicit placement plan (no fake success).
 */

import { loadNativeModule } from './native.js'
import { assertLocalImportPath, pathBasename } from './premiere-path.js'
import { aeLayerTiming, planAeInserts, sceneSourceWindowSec } from './ae-placement.js'

function getExtendScriptApp() {
  try {
    // eslint-disable-next-line no-undef
    if (typeof app !== 'undefined' && app?.project) return app
  } catch {
    /* ignore */
  }
  return null
}

async function getAeUxpModule() {
  for (const id of ['aeft', 'aftereffects']) {
    try {
      return await loadNativeModule(id)
    } catch {
      /* try next */
    }
  }
  return null
}

function findCompByName(project, name) {
  const want = String(name || '').trim()
  if (!want) return null
  for (let i = 1; i <= project.numItems; i += 1) {
    const item = project.item(i)
    if (item && item instanceof CompItem && item.name === want) return item
  }
  return null
}

function findFootageByPath(project, filePath) {
  const base = pathBasename(filePath)
  for (let i = 1; i <= project.numItems; i += 1) {
    const item = project.item(i)
    if (!(item instanceof FootageItem)) continue
    try {
      const main = item.mainSource
      if (main instanceof FileSource && main.file) {
        const full = String(main.file.fsName || main.file.fullName || '')
        if (full === filePath || full.endsWith(base)) return item
      }
    } catch {
      /* continue */
    }
    if (item.name === base) return item
  }
  return null
}

function importFootage(project, filePath) {
  const existing = findFootageByPath(project, filePath)
  if (existing) return existing
  const file = new File(filePath)
  if (!file.exists) throw new Error(`Datei nicht gefunden: ${filePath}`)
  return project.importFile(new ImportOptions(file))
}

function getOrCreateComp(project, compName, fps) {
  const name = String(compName || 'VIDEON').trim() || 'VIDEON'
  const existing = findCompByName(project, name)
  if (existing) return existing
  const rate = Number(fps) > 0 ? Number(fps) : 25
  return project.items.addComp(name, 1920, 1080, 1, rate, 10)
}

function applyLayerTiming(layer, timing) {
  layer.startTime = timing.startTime
  layer.inPoint = timing.inPoint
  if (timing.outPoint != null) layer.outPoint = timing.outPoint
}

/**
 * @param {{
 *   filePath: string,
 *   compName: string,
 *   hit: object,
 *   sequential?: boolean,
 *   gapFrames?: number,
 *   fps?: number,
 *   startAtSec?: number,
 * }} input
 */
export async function insertHitIntoAfterEffects(input) {
  const localPath = assertLocalImportPath(input.filePath)
  const fps = Number(input.fps) > 0 ? Number(input.fps) : 25
  const plan = planAeInserts([input.hit], {
    sequential: input.sequential !== false,
    gapFrames: input.gapFrames,
    fps,
    startAtSec: input.startAtSec,
  })[0]
  const timing = aeLayerTiming(input.hit, plan.compTimeSec)
  const allowPlan = input.allowPlan === true

  const esApp = getExtendScriptApp()
  if (esApp?.project) {
    try {
      const project = esApp.project
      const comp = getOrCreateComp(project, input.compName, fps)
      const footage = importFootage(project, localPath)
      if (!footage) throw new Error('Footage-Import fehlgeschlagen')
      const layer = comp.layers.add(footage)
      applyLayerTiming(layer, timing)
      return {
        ok: true,
        mode: 'extendscript',
        message: `AE: „${input.hit.mediaFilename || pathBasename(localPath)}“ → Comp „${comp.name}“`,
        plan,
      }
    } catch (error) {
      return {
        ok: false,
        mode: 'extendscript',
        message: error instanceof Error ? error.message : String(error),
        plan,
      }
    }
  }

  const uxp = await getAeUxpModule()
  if (uxp && !uxp.__videonStub) {
    return {
      ok: false,
      mode: 'uxp-pending',
      message:
        'AE UXP DOM-APIs noch nicht öffentlich — Placement geplant; ExtendScript-Host oder spätere Adobe-API nötig',
      plan,
      sourceWindow: sceneSourceWindowSec(input.hit),
      filePath: localPath,
    }
  }

  const planMessage = `AE-Plan: ${localPath} → Comp „${input.compName || 'VIDEON'}“ @ ${plan.compTimeSec.toFixed(2)}s`
  if (allowPlan) {
    return { ok: true, mode: 'plan', message: planMessage, plan, filePath: localPath }
  }
  return {
    ok: false,
    mode: 'unsupported',
    message:
      'After Effects Insert braucht ExtendScript `app.project` oder künftige AE UXP DOM-APIs. Placement wurde berechnet, aber nicht eingefügt.',
    plan,
    filePath: localPath,
  }
}

/**
 * Multi-hit sequential insert helper for tests / future batch UI.
 */
export function planAfterEffectsBatch(hits, opts) {
  return planAeInserts(hits, opts)
}
