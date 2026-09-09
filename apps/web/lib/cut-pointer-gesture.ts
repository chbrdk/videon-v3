/**
 * Window-level pointer gesture helpers for Cut timeline free-move.
 * Avoid setPointerCapture: React re-renders replace the clip node and drop capture mid-drag.
 */

export type PointerGestureHandlers = {
  onMove: (event: PointerEvent) => void
  onUp: (event: PointerEvent) => void
}

export function bindPointerGesture(handlers: PointerGestureHandlers): () => void {
  const { onMove, onUp } = handlers
  const finish = (event: PointerEvent) => {
    unbind()
    onUp(event)
  }
  const unbind = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  return unbind
}

/** Suppress the synthetic click that follows an armed drag. */
export function armClickSuppress(ref: { current: boolean }, ms = 350) {
  ref.current = true
  globalThis.setTimeout(() => {
    ref.current = false
  }, ms)
}
