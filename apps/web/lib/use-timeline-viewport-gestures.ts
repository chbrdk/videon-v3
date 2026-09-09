'use client'

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { scrollLeftAfterZoom } from '@/lib/timeline-snap'
import { timelineMsPerPixel, type TimelineZoomLevel } from '@/lib/timeline-layout'

type TimelineViewportGesturesOptions = {
  viewportRef: RefObject<HTMLElement | null>
  zoomIndex: number
  setZoomIndex: Dispatch<SetStateAction<number>>
  zoomLevels: readonly TimelineZoomLevel[]
  onSeekDelta: (deltaMs: number) => void
  enabled?: boolean
  frameMs?: number
  coarseMs?: number
}

/**
 * Cut timeline viewport wheel:
 * - pinch / ctrl|meta+wheel → stepped zoom toward cursor
 * - deltaX / shift+wheel / plain deltaY → horizontal pan
 * - alt+wheel → jog seek (former useJogShuttle default)
 */
export function useTimelineViewportGestures(options: TimelineViewportGesturesOptions): void {
  const {
    viewportRef,
    zoomIndex,
    setZoomIndex,
    zoomLevels,
    onSeekDelta,
    enabled = true,
    frameMs = 40,
    coarseMs = 1000,
  } = options

  const zoomIndexRef = useRef(zoomIndex)
  zoomIndexRef.current = zoomIndex
  const onSeekDeltaRef = useRef(onSeekDelta)
  onSeekDeltaRef.current = onSeekDelta

  useEffect(() => {
    const element = viewportRef.current
    if (!element || !enabled) return

    let zoomAccum = 0

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      if (event.altKey) {
        const magnitude = Math.min(Math.abs(event.deltaY) || Math.abs(event.deltaX), 120)
        const steps = Math.max(1, Math.round(magnitude / 40))
        const unit = event.shiftKey ? coarseMs : frameMs
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
        const direction = delta > 0 ? 1 : -1
        onSeekDeltaRef.current(direction * unit * steps)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        zoomAccum += event.deltaY
        if (Math.abs(zoomAccum) < 20) return
        const direction = zoomAccum > 0 ? -1 : 1
        zoomAccum = 0
        const currentIndex = zoomIndexRef.current
        const nextIndex = Math.min(Math.max(currentIndex + direction, 0), zoomLevels.length - 1)
        if (nextIndex === currentIndex) return
        const oldLevel = zoomLevels[currentIndex] ?? 1
        const newLevel = zoomLevels[nextIndex] ?? 1
        const oldMpp = timelineMsPerPixel(oldLevel)
        const newMpp = timelineMsPerPixel(newLevel)
        const rect = element.getBoundingClientRect()
        const pointerOffsetX = event.clientX - rect.left
        element.scrollLeft = scrollLeftAfterZoom({
          scrollLeft: element.scrollLeft,
          pointerOffsetX,
          oldMsPerPixel: oldMpp,
          newMsPerPixel: newMpp,
        })
        zoomIndexRef.current = nextIndex
        setZoomIndex(nextIndex)
        return
      }

      const useShiftAsHorizontal = event.shiftKey
      const dx =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) || useShiftAsHorizontal
          ? useShiftAsHorizontal && Math.abs(event.deltaX) < 0.5
            ? event.deltaY
            : event.deltaX || event.deltaY
          : event.deltaY
      element.scrollLeft += dx
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [coarseMs, enabled, frameMs, setZoomIndex, viewportRef, zoomLevels])
}
