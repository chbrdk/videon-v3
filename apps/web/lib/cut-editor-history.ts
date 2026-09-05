export type CutTimelineSnapshotScene = {
  id: string
  position: number
  mediaAssetId: string
  startMs: number
  endMs: number
}

export type CutEditorSnapshot = {
  scenes: CutTimelineSnapshotScene[]
  cutPlayheadMs: number
  activeIndex: number
}

export function snapshotFromClips(
  clips: Array<{
    scene: {
      id: string
      position: number
      mediaAssetId: string
      startMs: number
      endMs: number
    }
  }>,
  cutPlayheadMs: number,
  activeIndex: number,
): CutEditorSnapshot {
  return {
    scenes: clips.map((clip) => ({ ...clip.scene })),
    cutPlayheadMs,
    activeIndex,
  }
}

export function pushCutEditorHistory(
  history: CutEditorSnapshot[],
  index: number,
  snapshot: CutEditorSnapshot,
): { history: CutEditorSnapshot[]; index: number } {
  const trimmed = history.slice(0, index + 1)
  const last = trimmed[trimmed.length - 1]
  if (last && JSON.stringify(last.scenes) === JSON.stringify(snapshot.scenes)) {
    return { history: trimmed, index: trimmed.length - 1 }
  }
  const next = [...trimmed, snapshot]
  if (next.length > 40) next.shift()
  return { history: next, index: next.length - 1 }
}
