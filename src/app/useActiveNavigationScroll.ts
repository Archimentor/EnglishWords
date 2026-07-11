import { useEffect, useRef } from 'react'

export function useActiveNavigationScroll(activeKey: string) {
  const activeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (
      typeof window.matchMedia !== 'function'
      || !window.matchMedia('(max-width: 520px)').matches
    ) {
      return
    }

    const button = activeButtonRef.current
    if (!button || typeof button.scrollIntoView !== 'function') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    button.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }, [activeKey])

  return activeButtonRef
}
