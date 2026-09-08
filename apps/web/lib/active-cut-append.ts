import { paths } from '@/lib/paths'
import { readStoredActiveCut, type ActiveCutContext } from '@/lib/active-cut'

export type ActiveCutSceneRange = {
  mediaAssetId: string
  startMs: number
  endMs: number
  sceneKey?: string | null
  platformProjectId?: string
}

export type AppendToActiveCutResult =
  | { ok: true; activeCut: ActiveCutContext; count: number }
  | { ok: false; code: 'no_active_cut' | 'collection_mismatch' | 'empty' | 'request_failed'; message: string }

export function activeCutForCollection(platformProjectId: string): ActiveCutContext | null {
  const active = readStoredActiveCut()
  if (!active) return null
  if (active.platformProjectId !== platformProjectId.trim()) return null
  return active
}

export async function appendScenesToActiveCut(
  scenes: ActiveCutSceneRange[],
  options?: { platformProjectId?: string },
): Promise<AppendToActiveCutResult> {
  const active = readStoredActiveCut()
  if (!active) {
    return {
      ok: false,
      code: 'no_active_cut',
      message: 'Kein aktiver Cut — Cut-Editor öffnen und als aktiv setzen.',
    }
  }
  const expectedPid = options?.platformProjectId?.trim() || active.platformProjectId
  if (active.platformProjectId !== expectedPid) {
    return {
      ok: false,
      code: 'collection_mismatch',
      message: 'Aktiver Cut gehört zu einem anderen Projekt.',
    }
  }

  const payloadScenes = scenes
    .filter((scene) => {
      if (scene.platformProjectId && scene.platformProjectId !== active.platformProjectId) return false
      return (
        Boolean(scene.mediaAssetId) &&
        typeof scene.startMs === 'number' &&
        typeof scene.endMs === 'number' &&
        scene.endMs > scene.startMs
      )
    })
    .map((scene) => ({
      mediaAssetId: scene.mediaAssetId,
      startMs: Math.floor(scene.startMs),
      endMs: Math.floor(scene.endMs),
      ...(scene.sceneKey ? { sceneKey: scene.sceneKey } : {}),
    }))

  if (!payloadScenes.length) {
    return { ok: false, code: 'empty', message: 'Keine gültigen Szenen-Ranges.' }
  }

  const response = await fetch(paths.routes.apiCutDetail(active.cutId, active.platformProjectId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addScenes', scenes: payloadScenes }),
  })
  const body = (await response.json()) as { error?: { message?: string } }
  if (!response.ok) {
    return {
      ok: false,
      code: 'request_failed',
      message: body.error?.message || 'Szenen konnten nicht zum Cut hinzugefügt werden',
    }
  }
  return { ok: true, activeCut: active, count: payloadScenes.length }
}
