/** Convert minimap pointer X into timeline scrollLeft so the window centers on the pointer. */
export function minimapPointerToScrollLeft(input: {
  clientX: number
  trackLeft: number
  trackWidth: number
  contentWidthPx: number
  viewportWidthPx: number
}): number {
  const width = Math.max(input.trackWidth, 1)
  const x = Math.min(Math.max(input.clientX - input.trackLeft, 0), width)
  const ratio = x / width
  const maxScroll = Math.max(0, input.contentWidthPx - input.viewportWidthPx)
  return Math.max(0, Math.min(ratio * input.contentWidthPx - input.viewportWidthPx / 2, maxScroll))
}
