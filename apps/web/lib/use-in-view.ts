'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

/** True once the element intersects the viewport (or root). Stays true after first hit. */
export function useInViewOnce<T extends Element>(
  options?: IntersectionObserverInit & { enabled?: boolean },
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const enabled = options?.enabled !== false
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!enabled || inView) return
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      {
        root: options?.root ?? null,
        rootMargin: options?.rootMargin ?? '120px 0px',
        threshold: options?.threshold ?? 0.01,
      },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, inView, options?.root, options?.rootMargin, options?.threshold])

  return [ref, inView]
}
