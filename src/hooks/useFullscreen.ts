import { useCallback, useEffect, useRef, useState } from 'react'

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else if (elementRef.current) {
      void elementRef.current.requestFullscreen()
    }
  }, [])

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === elementRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return { isFullscreen, toggle, fullscreenRef: elementRef }
}