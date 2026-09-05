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
        handlersRef.current.onTogglePlay?.()
        return
      }
      if (key === 'j') {
        event.preventDefault()
        handlersRef.current.onSeekBack?.()
        return
      }
      if (key === 'l') {
        event.preventDefault()
        handlersRef.current.onSeekForward?.()
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
