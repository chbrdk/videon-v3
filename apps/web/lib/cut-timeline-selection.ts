export type CutSelectionLane = 'v1' | 'v2' | 'audio'

export type CutSelection =
  | { lane: 'v1'; id: string }
  | { lane: 'v2'; id: string }
  | { lane: 'audio'; id: string }

export type CutSelectableEdge = {
  id: string
  cutStartMs: number
  cutEndMs: number
}

export function selectionKey(item: CutSelection): string {
  return `${item.lane}:${item.id}`
}

export function sameSelection(a: CutSelection, b: CutSelection): boolean {
  return a.lane === b.lane && a.id === b.id
}

export function toggleCutSelection(current: CutSelection[], target: CutSelection): CutSelection[] {
  const index = current.findIndex((item) => sameSelection(item, target))
  if (index >= 0) {
    return current.filter((_, i) => i !== index)
  }
  return [...current, target]
}

/** Expand selection to inclusive range on the same lane by timeline order. */
export function rangeCutSelection(
  laneItems: CutSelectableEdge[],
  anchorId: string | null,
  targetId: string,
  lane: CutSelectionLane,
): CutSelection[] {
  const ordered = [...laneItems].sort((a, b) => a.cutStartMs - b.cutStartMs || a.id.localeCompare(b.id))
  const targetIndex = ordered.findIndex((item) => item.id === targetId)
  if (targetIndex < 0) return [{ lane, id: targetId } as CutSelection]

  const anchorIndex = anchorId ? ordered.findIndex((item) => item.id === anchorId) : targetIndex
  const from = Math.min(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex)
  const to = Math.max(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex)
  return ordered.slice(from, to + 1).map((item) => ({ lane, id: item.id }) as CutSelection)
}

export function primaryCutSelection(selected: CutSelection[]): CutSelection | null {
  return selected.length > 0 ? selected[selected.length - 1]! : null
}

export function isCutSelected(selected: CutSelection[], lane: CutSelectionLane, id: string): boolean {
  return selected.some((item) => item.lane === lane && item.id === id)
}
