'use client'

import { useEffect, useRef } from 'react'

export type EditorKeyboardHandlers = {
  enabled?: boolean
  onTogglePlay?: () => void
  onSeekBack?: () => void
  onSeekForward?: () => void
  onStepBack?: () => void
  onStepForward?: () => void
  onFrameBack?: () => void
  onFrameForward?: () => void
  onMarkIn?: () => void
  onMarkOut?: () => void
  onSplit?: () => void
  onDelete?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onToggleSnap?: () => void
  onCycleSnapFilter?: () => void
  onFitSelection?: () => void
  onFitAll?: () => void
  onNudgeLeft?: (coarse: boolean) => void
  onNudgeRight?: (coarse: boolean) => void
  onToolSelect?: () => void
  onToolTrim?: () => void
  onCycleTrimMode?: () => void
  onToggleRipple?: () => void
  onSeekSelectionStart?: () => void
  onMoveSelectionToPlayhead?: () => void
  onToggleZoomAnchor?: () => void
  onToggleClipLock?: () => void
  onToggleLinkAudio?: () => void
  onShuttleHold?: (direction: -1 | 1, holding: boolean) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function useEditorKeyboard(handlers: EditorKeyboardHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handlersRef.current.enabled === false) return
      if (isTypingTarget(event.target)) return
      if (event.repeat) {
        // Shuttle hold uses keydown repeat via onShuttleHold; ignore other repeats.
        const key = event.key.toLowerCase()
        if (key === 'j' || key === 'l') {
          event.preventDefault()
          handlersRef.current.onShuttleHold?.(key === 'j' ? -1 : 1, true)
        }
        return
      }

      const meta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (meta && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onUndo?.()
        return
      }
      if (meta && ((key === 'z' && event.shiftKey) || key === 'y')) {
        event.preventDefault()
        handlersRef.current.onRedo?.()
        return
      }

      if (key === ' ') {
        event.preventDefault()
        handlersRef.current.onTogglePlay?.()
        return
      }
      if (key === 'k') {
        event.preventDefault()
        handlersRef.current.onShuttleHold?.(1, false)
        handlersRef.current.onTogglePlay?.()
        return
      }
      if (key === 'j') {
        event.preventDefault()
        handlersRef.current.onShuttleHold?.(-1, true)
        handlersRef.current.onSeekBack?.()
        return
      }
      if (key === 'l' && event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onToggleClipLock?.()
        return
      }
      if (key === 'l') {
        event.preventDefault()
        handlersRef.current.onShuttleHold?.(1, true)
        handlersRef.current.onSeekForward?.()
        return
      }
      if (key === 'a' && event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onToggleLinkAudio?.()
        return
      }
      if (key === 'a' && !meta) {
        event.preventDefault()
        handlersRef.current.onToolSelect?.()
        return
      }
      if (key === 't' && !meta) {
        event.preventDefault()
        handlersRef.current.onToolTrim?.()
        return
      }
      if (key === 'u' && !meta) {
        event.preventDefault()
        handlersRef.current.onCycleTrimMode?.()
        return
      }
      if (key === 'r' && !meta) {
        event.preventDefault()
        handlersRef.current.onToggleRipple?.()
        return
      }
      if (key === 'i') {
        event.preventDefault()
        handlersRef.current.onMarkIn?.()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        handlersRef.current.onMarkOut?.()
        return
      }
      if (key === 'n' && event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onCycleSnapFilter?.()
        return
      }
      if (key === 'n' && !meta) {
        event.preventDefault()
        handlersRef.current.onToggleSnap?.()
        return
      }
      if (key === 'z' && !meta) {
        event.preventDefault()
        if (event.shiftKey) handlersRef.current.onFitAll?.()
        else handlersRef.current.onFitSelection?.()
        return
      }
      if (event.key === ';' || event.code === 'Semicolon') {
        event.preventDefault()
        handlersRef.current.onSeekSelectionStart?.()
        return
      }
      if (event.key === "'" || event.code === 'Quote') {
        event.preventDefault()
        handlersRef.current.onMoveSelectionToPlayhead?.()
        return
      }
      if (event.key === '\\' || event.code === 'Backslash') {
        event.preventDefault()
        handlersRef.current.onToggleZoomAnchor?.()
        return
      }
      if (event.key === ',' || event.key === '<') {
        event.preventDefault()
        handlersRef.current.onFrameBack?.()
        return
      }
      if (event.key === '.' || event.key === '>') {
        event.preventDefault()
        handlersRef.current.onFrameForward?.()
        return
      }
      if (event.altKey && key === 'arrowleft') {
        event.preventDefault()
        handlersRef.current.onNudgeLeft?.(event.shiftKey)
        return
      }
      if (event.altKey && key === 'arrowright') {
        event.preventDefault()
        handlersRef.current.onNudgeRight?.(event.shiftKey)
        return
      }
      if (key === 'arrowleft' && event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onSeekBack?.()
        return
      }
      if (key === 'arrowright' && event.shiftKey) {
        event.preventDefault()
        handlersRef.current.onSeekForward?.()
        return
      }
      if (key === 'arrowleft') {
        event.preventDefault()
        handlersRef.current.onStepBack?.()
        return
      }
      if (key === 'arrowright') {
        event.preventDefault()
        handlersRef.current.onStepForward?.()
        return
      }
      if (key === 's' && !meta) {
        event.preventDefault()
        handlersRef.current.onSplit?.()
        return
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault()
        handlersRef.current.onDelete?.()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (handlersRef.current.enabled === false) return
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'j' || key === 'l') {
        handlersRef.current.onShuttleHold?.(key === 'j' ? -1 : 1, false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
