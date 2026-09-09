'use client'

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { scrollLeftAfterZoom } from '@/lib/timeline-snap'
import { applyInertiaScrollLeft, nextInertiaVelocity } from '@/lib/timeline-pan-inertia'
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
 * - deltaX / shift+wheel / plain deltaY → horizontal pan (+ inertia)
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
    let panVelocity = 0
    let lastPanAt = 0
    let inertiaRaf = 0
    let idleTimer = 0

    const cancelInertia = () => {
      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf)
        inertiaRaf = 0
      }
      if (idleTimer) {
        window.clearTimeout(idleTimer)
        idleTimer = 0
      }
      panVelocity = 0
    }

    const runInertia = () => {
      inertiaRaf = 0
      panVelocity = nextInertiaVelocity(panVelocity)
      if (panVelocity === 0) return
      element.scrollLeft = applyInertiaScrollLeft(element.scrollLeft, panVelocity)
      inertiaRaf = requestAnimationFrame(runInertia)
    }

    const scheduleInertia = () => {
      if (idleTimer) window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        idleTimer = 0
        if (Math.abs(panVelocity) < 0.2) {
          panVelocity = 0
          return
        }
        if (inertiaRaf) cancelAnimationFrame(inertiaRaf)
        inertiaRaf = requestAnimationFrame(runInertia)
      }, 100)
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      if (event.altKey) {
        cancelInertia()
        const magnitude = Math.min(Math.abs(event.deltaY) || Math.abs(event.deltaX), 120)
        const steps = Math.max(1, Math.round(magnitude / 40))
        const unit = event.shiftKey ? coarseMs : frameMs
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX
        const direction = delta > 0 ? 1 : -1
        onSeekDeltaRef.current(direction * unit * steps)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        cancelInertia()
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

      if (inertiaRaf) {
        cancelAnimationFrame(inertiaRaf)
        inertiaRaf = 0
      }

      const useShiftAsHorizontal = event.shiftKey
      const dx =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) || useShiftAsHorizontal
          ? useShiftAsHorizontal && Math.abs(event.deltaX) < 0.5
            ? event.deltaY
            : event.deltaX || event.deltaY
          : event.deltaY
      element.scrollLeft += dx

      const now = performance.now()
      const dt = Math.max(1, now - lastPanAt)
      lastPanAt = now
      // Blend toward recent wheel delta as velocity (px/frame-ish).
      panVelocity = panVelocity * 0.35 + (dx * (16 / dt)) * 0.65
      scheduleInertia()
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      cancelInertia()
      element.removeEventListener('wheel', onWheel)
    }
  }, [coarseMs, enabled, frameMs, setZoomIndex, viewportRef, zoomLevels])
}
