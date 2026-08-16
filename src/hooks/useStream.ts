import { useCallback, useEffect, useRef } from 'react'
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

    setCameraStatus(camera.id, 'connecting', 'Menghubungkan...')

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

      // Proteksi autoplay: video yang TIDAK sedang diputar (paused) karena
      // autoplay diblokir browser BUKAN stall. Jangan picu reconnect loop.
      if (video.paused) return

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
    // Pakai koneksi yang sama dengan backoff (bukan langsung reconnect tanpa
    // jeda) agar tidak membebani jaringan/kamera saat stream macet berulang.
    const conn = connectionRef.current
    if (conn) {
      clearStallTimer()
      conn.reconnectWithBackoff('Stream berhenti / tidak ada data')
      return
    }
    setCameraStatus(cameraId, 'reconnecting', 'Stream berhenti / tidak ada data')
  }

  const retry = useCallback(() => {
    const conn = connectionRef.current
    if (conn) {
      conn.retryNow()
    } else if (camera && isCameraConfigured(camera)) {
      setCameraStatus(camera.id, 'connecting', 'Mencoba lagi...')
      const config = loadConfig()
      const { host, apiPort } = config.settings.go2rtc
      const fresh = new StreamConnection(camera, host, apiPort, {
        onStatusChange: (status, message) => {
          setCameraStatus(camera.id, status, message)
          if (status === 'online') startStallMonitor()
          else clearStallTimer()
        },
        onTrack: (stream) => {
          const v = videoRef.current
          if (v) {
            v.srcObject = stream
            void v.play().catch(() => {})
          }
        },
      })
      connectionRef.current = fresh
      fresh.start()
    }
  }, [camera, videoRef])

  return { retry }
}