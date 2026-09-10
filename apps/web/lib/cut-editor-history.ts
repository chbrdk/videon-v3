export type CutTimelineSnapshotScene = {
  id: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs?: number
  sceneKey?: string | null
  premiereFiltersXml?: string | null
}

export type CutTimelineSnapshotClip = {
  id: string
  trackId: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
  timelineStartMs: number
}

export type CutEditorSnapshot = {
  scenes: CutTimelineSnapshotScene[]
  videoClips: CutTimelineSnapshotClip[]
  audioClips: CutTimelineSnapshotClip[]
  cutPlayheadMs: number
  activeIndex: number
}

function mapOverlayClips(
  clips: Array<{
    id: string
    trackId: string
    position: number
    mediaAssetId: string
    startMs: number
    endMs: number
    timelineStartMs: number
  }>,
): CutTimelineSnapshotClip[] {
  return clips.map((clip) => ({
    id: clip.id,
    trackId: clip.trackId,
    position: clip.position,
    mediaAssetId: clip.mediaAssetId,
    startMs: clip.startMs,
    endMs: clip.endMs,
    timelineStartMs: Math.max(0, clip.timelineStartMs ?? 0),
  }))
}

export function snapshotCutEditor(input: {
  clips: Array<{
    scene: {
      id: string
      position: number
      mediaAssetId: string
      startMs: number
      endMs: number
      timelineStartMs?: number
      sceneKey?: string | null
      premiereFiltersXml?: string | null
    }
  }>
  videoClips?: Array<{
    id: string
    trackId: string
    position: number
    mediaAssetId: string
    startMs: number
    endMs: number
    timelineStartMs: number
  }>
  audioClips?: Array<{
    id: string
    trackId: string
    position: number
    mediaAssetId: string
    startMs: number
    endMs: number
    timelineStartMs: number
  }>
  cutPlayheadMs: number
  activeIndex: number
}): CutEditorSnapshot {
  return {
    scenes: input.clips.map((clip) => ({
      id: clip.scene.id,
      position: clip.scene.position,
      mediaAssetId: clip.scene.mediaAssetId,
      startMs: clip.scene.startMs,
      endMs: clip.scene.endMs,
      timelineStartMs: clip.scene.timelineStartMs ?? 0,
      sceneKey: clip.scene.sceneKey ?? null,
      premiereFiltersXml: clip.scene.premiereFiltersXml ?? null,
    })),
    videoClips: mapOverlayClips(input.videoClips ?? []),
    audioClips: mapOverlayClips(input.audioClips ?? []),
    cutPlayheadMs: input.cutPlayheadMs,
    activeIndex: input.activeIndex,
  }
}

/** @deprecated Prefer snapshotCutEditor — multilayer Wave 4. */
export function snapshotFromClips(
  clips: Array<{
    scene: {
      id: string
      position: number
      mediaAssetId: string
      startMs: number
      endMs: number
      timelineStartMs?: number
      sceneKey?: string | null
    }
  }>,
  cutPlayheadMs: number,
  activeIndex: number,
): CutEditorSnapshot {
  return snapshotCutEditor({ clips, cutPlayheadMs, activeIndex })
}

export function timelineSnapshotKey(snapshot: CutEditorSnapshot): string {
  return JSON.stringify({
    scenes: snapshot.scenes,
    videoClips: snapshot.videoClips,
    audioClips: snapshot.audioClips,
  })
}

export function pushCutEditorHistory(
  history: CutEditorSnapshot[],
  index: number,
  snapshot: CutEditorSnapshot,
): { history: CutEditorSnapshot[]; index: number } {
  const trimmed = history.slice(0, index + 1)
  const last = trimmed[trimmed.length - 1]
  if (last && timelineSnapshotKey(last) === timelineSnapshotKey(snapshot)) {
    return { history: trimmed, index: trimmed.length - 1 }
  }
  const next = [...trimmed, snapshot]
  if (next.length > 40) next.shift()
  return { history: next, index: next.length - 1 }
}
