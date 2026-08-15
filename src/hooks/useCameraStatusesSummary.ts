import { useEffect, useState } from 'react'
import { getCameraStatuses, subscribeCameraStatuses } from '@/services/cameraService'
import { loadConfig } from '@/services/configService'

export interface CameraStatusSummary {
  total: number
  online: number
  offline: number
  connecting: number
  reconnecting: number
  error: number
}

function computeSummary(): CameraStatusSummary {
  const cameras = loadConfig().cameras.filter((c) => c.enabled)
  const statuses = getCameraStatuses()
  const summary: CameraStatusSummary = {
    total: cameras.length,
    online: 0,
    offline: 0,
    connecting: 0,
    reconnecting: 0,
    error: 0,
  }
  for (const cam of cameras) {
    const s = statuses.get(cam.id)?.status ?? 'idle'
    if (s === 'online') summary.online++
    else if (s === 'offline') summary.offline++
    else if (s === 'connecting') summary.connecting++
    else if (s === 'reconnecting') summary.reconnecting++
    else if (s === 'error') summary.error++
  }
  return summary
}

export function useCameraStatusesSummary(): CameraStatusSummary {
  const [summary, setSummary] = useState<CameraStatusSummary>(computeSummary)

  useEffect(() => {
    const unsub = subscribeCameraStatuses(() => setSummary(computeSummary()))
    return unsub
  }, [])

  return summary
}
