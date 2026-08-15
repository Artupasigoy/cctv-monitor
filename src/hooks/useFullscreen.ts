import { useCallback, useEffect, useRef, useState } from 'react'

interface FullscreenOptions {
  onExit?: () => void
}

export function useFullscreen(options?: FullscreenOptions) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const elementRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else if (elementRef.current) {
      void elementRef.current.requestFullscreen()
    }
  }, [])

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
  }, [])

  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement === elementRef.current
      setIsFullscreen(fs)
      if (!fs) options?.onExit?.()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [options])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return { isFullscreen, toggle, exit, fullscreenRef: elementRef }
}
