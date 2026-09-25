import { describe, expect, it } from 'vitest'
import {
  encodeClipDisplayName,
  sceneIdFromClipItemBody,
  sceneIdFromClipName,
  stripSceneIdMark,
} from '../../../tools/adobe-uxp-library-panel/src/clip-identity.js'

describe('clip-identity Wave P4', () => {
  const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

  it('encodes and decodes scene marks in clip names', () => {
    const name = encodeClipDisplayName('fin 1.mp4', id)
    expect(name).toBe(`fin 1.mp4 ⟦${id}⟧`)
    expect(sceneIdFromClipName(name)).toBe(id)
    expect(stripSceneIdMark(name)).toBe('fin 1.mp4')
  })

  it('reads scene id from clipitem body name or comments', () => {
    expect(
      sceneIdFromClipItemBody(`<name>a.mp4 ⟦${id}⟧</name><comments>other</comments>`),
    ).toBe(id)
    expect(
      sceneIdFromClipItemBody(`<name>a.mp4</name><comments>videon:scene:${id}</comments>`),
    ).toBe(id)
    expect(sceneIdFromClipName(`a.mp4 [${id}]`)).toBe(id)
    expect(sceneIdFromClipName(`a.mp4 //MD:${id}`)).toBe(id)
  })
})
