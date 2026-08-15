import { useCallback, useEffect, useRef, useState } from 'react'
import type { Camera } from '@/types/camera'
import { getCameraStatus, subscribeCameraStatuses, type StatusListener } from '@/services/cameraService'
import { loadConfig } from '@/services/configService'

export function useCamera(cameraId: string | null) {
  const [status, setStatus] = useState(() =>
    cameraId ? getCameraStatus(cameraId) : { status: 'idle' as const },
  )
  const cameraRef = useRef<Camera | null>(null)

  useEffect(() => {
    cameraRef.current = cameraId ? (loadConfig().cameras.find((c) => c.id === cameraId) ?? null) : null
  }, [cameraId])

  useEffect(() => {
    if (!cameraId) return
    const listener: StatusListener = (all) => {
      const s = all.get(cameraId)
      if (s) setStatus(s)
    }
    const unsub = subscribeCameraStatuses(listener)
    const initial = getCameraStatus(cameraId)
    if (initial.status !== 'idle') setStatus(initial)
    return unsub
  }, [cameraId])

  const refresh = useCallback(() => {
    if (cameraId) setStatus(getCameraStatus(cameraId))
  }, [cameraId])

  return { camera: cameraRef.current, status, refresh }
}
