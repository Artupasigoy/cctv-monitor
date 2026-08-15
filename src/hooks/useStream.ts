import { useEffect, useRef } from 'react'
import type { Camera } from '@/types/camera'
import { getCameraStatus, setCameraStatus } from '@/services/cameraService'
import { loadConfig } from '@/services/configService'
import { isCameraConfigured, StreamConnection } from '@/services/streamService'

const STALL_CHECK_INTERVAL_MS = 3000
const STALL_THRESHOLD_MS = 10000

interface UseStreamOptions {
  enabled?: boolean
}

export function useStream(camera: Camera | null, videoRef: React.RefObject<HTMLVideoElement>, options?: UseStreamOptions) {
  const connectionRef = useRef<StreamConnection | null>(null)
  const stallTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!camera || !isCameraConfigured(camera) || options?.enabled === false) {
      clearStallTimer()
      if (connectionRef.current) {
        connectionRef.current.stop()
        connectionRef.current = null
      }
      if (video) video.srcObject = null
      return
    }

    setCameraStatus(camera.id, 'connecting')

    const config = loadConfig()
    const { host, apiPort } = config.settings.go2rtc

    const conn = new StreamConnection(camera, host, apiPort, {
      onStatusChange: (status, message) => {
        setCameraStatus(camera.id, status, message)
        if (status === 'online') {
          startStallMonitor()
        } else {
          clearStallTimer()
        }
      },
      onTrack: (stream) => {
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          void v.play().catch(() => {})
        }
      },
    })

    connectionRef.current = conn
    conn.start()

    return () => {
      clearStallTimer()
      conn.stop()
      connectionRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [camera?.id, videoRef, options?.enabled])

  const clearStallTimer = () => {
    if (stallTimerRef.current !== null) {
      window.clearInterval(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }

  const startStallMonitor = () => {
    clearStallTimer()
    let lastSeenTime = -1
    let lastMovedAt = Date.now()
    stallTimerRef.current = window.setInterval(() => {
      if (!camera) return
      const status = getCameraStatus(camera.id).status
      if (status !== 'online') return

      const video = videoRef.current
      if (!video || !video.srcObject) return

      const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : null
      if (track && track.readyState === 'ended') {
        handleStall(camera.id)
        return
      }

      const current = video.currentTime
      if (current > lastSeenTime) {
        lastSeenTime = current
        lastMovedAt = Date.now()
        return
      }

      if (lastSeenTime === -1) {
        lastSeenTime = current
        lastMovedAt = Date.now()
        return
      }

      if (Date.now() - lastMovedAt > STALL_THRESHOLD_MS) {
        handleStall(camera.id)
      }
    }, STALL_CHECK_INTERVAL_MS)
  }

  const handleStall = (cameraId: string) => {
    console.log(`[useStream] stall detected for ${cameraId}`)
    setCameraStatus(cameraId, 'reconnecting', 'Stream berhenti')
    const conn = connectionRef.current
    if (conn) {
      conn.stop()
      connectionRef.current = null
    }
    const v = videoRef.current
    if (v) v.srcObject = null

    const cam = camera
    if (!cam || !isCameraConfigured(cam)) return
    const config = loadConfig()
    const { host, apiPort } = config.settings.go2rtc
    const fresh = new StreamConnection(cam, host, apiPort, {
      onStatusChange: (status, message) => {
        setCameraStatus(cam.id, status, message)
        if (status === 'online') {
          startStallMonitor()
        } else {
          clearStallTimer()
        }
      },
      onTrack: (stream) => {
        const vv = videoRef.current
        if (vv) {
          vv.srcObject = stream
          void vv.play().catch(() => {})
        }
      },
    })
    connectionRef.current = fresh
    fresh.start()
  }
}
