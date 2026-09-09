/** Resolve which Source Audio mute pair applies for the program video lane. */
export function effectiveStemMutes(input: {
  programLane: 'v1' | 'v2' | null
  mutes: {
    a1: boolean
    a2: boolean
    v2a1?: boolean
    v2a2?: boolean
  }
}): { a1: boolean; a2: boolean } {
  if (input.programLane === 'v2') {
    return { a1: Boolean(input.mutes.v2a1), a2: Boolean(input.mutes.v2a2) }
  }
  return { a1: input.mutes.a1, a2: input.mutes.a2 }
}

/** Media id whose stems should drive the monitor at cutMs. */
export function programStemMediaId(input: {
  hit: { lane: 'v1' | 'v2'; mediaAssetId: string } | null
}): string | null {
  return input.hit?.mediaAssetId ?? null
}
