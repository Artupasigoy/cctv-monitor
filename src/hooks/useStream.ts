import { useCallback, useEffect, useRef } from 'react'
import type { Camera, QualityMode } from '@/types/camera'
import { getCameraStatus, setCameraStatus } from '@/services/cameraService'
import { loadConfig } from '@/services/configService'
import { isCameraConfigured, StreamConnection } from '@/services/streamService'
import { applyCameraSource } from '@/services/go2rtcConfigService'

const STALL_CHECK_INTERVAL_MS = 3000
const STALL_THRESHOLD_MS = 10000

/** Interval cek statistik WebRTC (packet loss/jitter) untuk deteksi koneksi lemah. */
const STATS_CHECK_INTERVAL_MS = 8000
/** Jumlah cek lemah berturut-turut sebelum mode auto turun ke low. */
const WEAK_STREAK_TO_SWITCH = 2
/** Jumlah cek lancar berturut-turut (~3 menit @8s) sebelum auto naik ke high. */
const SMOOTH_TO_HIGH_CHECKS = 22
/** Jeda minimal antar switch otomatis (anti-flapping). */
const AUTO_SWITCH_COOLDOWN_MS = 120000
/** Ambang packet loss video yang dianggap lemah. */
const WEAK_LOSS_RATIO = 0.05
/** Ambang jitter video (ms) yang dianggap lemah. */
const WEAK_JITTER_MS = 150

interface UseStreamOptions {
  enabled?: boolean
  qualityMode?: QualityMode
  soundEnabled?: boolean
  onWeakSignal?: (weak: boolean) => void
  onEffectiveModeChange?: (mode: 'high' | 'low') => void
}

export function useStream(camera: Camera | null, videoRef: React.RefObject<HTMLVideoElement>, options?: UseStreamOptions) {
  const connectionRef = useRef<StreamConnection | null>(null)
  const stallTimerRef = useRef<number | null>(null)
  const statsTimerRef = useRef<number | null>(null)

  const cameraRef = useRef(camera)
  const optsRef = useRef(options)
  const onWeakRef = useRef(options?.onWeakSignal)
  const onEffectiveRef = useRef(options?.onEffectiveModeChange)

  const effectiveModeRef = useRef<'high' | 'low'>('high')
  const weakStreakRef = useRef(0)
  const smoothStreakRef = useRef(0)
  const lastSwitchAtRef = useRef(0)
  const weakSignalRef = useRef(false)
  const prevModeRef = useRef<QualityMode | undefined>(undefined)

  cameraRef.current = camera
  optsRef.current = options
  onWeakRef.current = options?.onWeakSignal
  onEffectiveRef.current = options?.onEffectiveModeChange

  const clearStallTimer = () => {
    if (stallTimerRef.current !== null) {
      window.clearInterval(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }

  const clearStatsTimer = () => {
    if (statsTimerRef.current !== null) {
      window.clearInterval(statsTimerRef.current)
      statsTimerRef.current = null
    }
  }

  const startStallMonitor = () => {
    clearStallTimer()
    const cam = cameraRef.current
    if (!cam) return
    let lastSeenTime = -1
    let lastMovedAt = Date.now()
    stallTimerRef.current = window.setInterval(() => {
      const c = cameraRef.current
      if (!c) return
      const status = getCameraStatus(c.id).status
      if (status !== 'online') return

      const video = videoRef.current
      if (!video || !video.srcObject) return

      // Proteksi autoplay: video yang TIDAK sedang diputar (paused) karena
      // autoplay diblokir browser BUKAN stall. Jangan picu reconnect loop.
      if (video.paused) return

      const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : null
      if (track && track.readyState === 'ended') {
        handleStall(c.id)
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
        handleStall(c.id)
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

  const buildCallbacks = (cam: Camera) => ({
    onStatusChange: (status: Parameters<typeof setCameraStatus>[1], message?: string) => {
      setCameraStatus(cam.id, status, message)
      if (status === 'online') {
        startStallMonitor()
      } else {
        clearStallTimer()
      }
    },
    onTrack: (stream: MediaStream) => {
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        void v.play().catch(() => {})
      }
    },
  })

  const stopConnection = () => {
    clearStallTimer()
    clearStatsTimer()
    if (connectionRef.current) {
      connectionRef.current.stop()
      connectionRef.current = null
    }
  }

  const startConnection = () => {
    const cam = cameraRef.current
    const opts = optsRef.current
    if (!cam || !isCameraConfigured(cam) || opts?.enabled === false) return
    const config = loadConfig()
    const { host, apiPort } = config.settings.go2rtc
    const conn = new StreamConnection(cam, host, apiPort, buildCallbacks(cam))
    connectionRef.current = conn
    conn.start()
  }

  const restartConnection = () => {
    stopConnection()
    startConnection()
  }

  const resetWeakSignal = () => {
    if (weakSignalRef.current) {
      weakSignalRef.current = false
      onWeakRef.current?.(false)
    }
  }

  /** Tukar source go2rtc ke mode efektif lalu reconnect. */
  const switchEffectiveMode = (mode: 'high' | 'low') => {
    const now = Date.now()
    if (now - lastSwitchAtRef.current < AUTO_SWITCH_COOLDOWN_MS) return
    lastSwitchAtRef.current = now
    effectiveModeRef.current = mode
    weakStreakRef.current = 0
    smoothStreakRef.current = 0
    onEffectiveRef.current?.(mode)
    const cam = cameraRef.current
    const opts = optsRef.current
    if (!cam) return
    const config = loadConfig()
    const { host, apiPort } = config.settings.go2rtc
    const dropAudio = !(opts?.soundEnabled ?? true)
    void applyCameraSource(cam, host, apiPort, { dropAudio, mode }).then(() => {
      restartConnection()
    })
  }

  /** Deteksi koneksi lemah berbasis getStats WebRTC (lokal, ringan). */
  const checkNetwork = () => {
    const cam = cameraRef.current
    const opts = optsRef.current
    const conn = connectionRef.current
    if (!cam || !conn || opts?.enabled === false) return

    const status = getCameraStatus(cam.id).status
    const mode = opts?.qualityMode ?? cam.qualityMode ?? 'auto'

    if (mode === 'auto') {
      if (status !== 'online') {
        weakStreakRef.current = 0
        smoothStreakRef.current = 0
        return
      }
      void conn.getVideoStats().then((s) => {
        if (!s) return
        const total = s.packetsLost + s.packetsReceived
        const lossRatio = total > 0 ? s.packetsLost / total : 0
        const weak = lossRatio > WEAK_LOSS_RATIO || s.jitterMs > WEAK_JITTER_MS

        if (weak) {
          weakStreakRef.current++
          smoothStreakRef.current = 0
          if (weakStreakRef.current >= WEAK_STREAK_TO_SWITCH && effectiveModeRef.current === 'high') {
            switchEffectiveMode('low')
          }
        } else {
          smoothStreakRef.current++
          weakStreakRef.current = 0
          if (effectiveModeRef.current === 'low' && smoothStreakRef.current >= SMOOTH_TO_HIGH_CHECKS) {
            switchEffectiveMode('high')
          }
        }
      })
      return
    }

    if (mode === 'high') {
      // Mode high manual: hanya tampilkan hint bila koneksi lemah (tanpa auto-switch).
      if (status !== 'online') {
        weakStreakRef.current = 0
        resetWeakSignal()
        return
      }
      void conn.getVideoStats().then((s) => {
        if (!s) return
        const total = s.packetsLost + s.packetsReceived
        const lossRatio = total > 0 ? s.packetsLost / total : 0
        const weak = lossRatio > WEAK_LOSS_RATIO || s.jitterMs > WEAK_JITTER_MS
        if (weak) {
          weakStreakRef.current++
          if (weakStreakRef.current >= WEAK_STREAK_TO_SWITCH && !weakSignalRef.current) {
            weakSignalRef.current = true
            onWeakRef.current?.(true)
          }
        } else {
          weakStreakRef.current = 0
          resetWeakSignal()
        }
      })
      return
    }

    // Mode low: tidak perlu deteksi.
    resetWeakSignal()
  }

  const startStatsTimer = () => {
    clearStatsTimer()
    statsTimerRef.current = window.setInterval(checkNetwork, STATS_CHECK_INTERVAL_MS)
  }

  useEffect(() => {
    const video = videoRef.current
    const cam = camera
    const opts = options
    if (!cam || !isCameraConfigured(cam) || !opts || opts.enabled === false) {
      stopConnection()
      resetWeakSignal()
      if (video) video.srcObject = null
      return
    }

    setCameraStatus(cam.id, 'connecting', 'Menghubungkan...')
    const initialMode = opts.qualityMode ?? cam.qualityMode ?? 'auto'
    effectiveModeRef.current = initialMode === 'auto' ? 'high' : initialMode
    weakStreakRef.current = 0
    smoothStreakRef.current = 0
    lastSwitchAtRef.current = 0
    resetWeakSignal()
    startConnection()

    return () => {
      stopConnection()
      resetWeakSignal()
      if (videoRef.current) videoRef.current.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.id, videoRef, options?.enabled])

  // Re-apply source ke go2rtc + reconnect saat mode kualitas / suara berubah.
  useEffect(() => {
    const cam = cameraRef.current
    const opts = optsRef.current
    if (!cam || !isCameraConfigured(cam) || !opts || opts.enabled === false) return

    const config = loadConfig()
    const { host, apiPort } = config.settings.go2rtc
    const dropAudio = !(opts.soundEnabled ?? true)
    const mode = opts.qualityMode ?? cam.qualityMode ?? 'auto'
    const modeChanged = prevModeRef.current !== undefined && prevModeRef.current !== mode
    prevModeRef.current = mode

    let eff: 'high' | 'low'
    if (mode === 'auto') {
      // Auto: pertahankan mode efektif saat ini bila hanya suara/revision berubah,
      // reset ke high hanya saat mode kualitas benar-benar dipilih ulang.
      eff = modeChanged ? 'high' : effectiveModeRef.current
    } else {
      eff = mode
    }
    effectiveModeRef.current = eff

    if (modeChanged) {
      weakStreakRef.current = 0
      smoothStreakRef.current = 0
      lastSwitchAtRef.current = 0
      resetWeakSignal()
    }

    if (mode === 'auto') {
      startStatsTimer()
    } else {
      clearStatsTimer()
    }

    void applyCameraSource(cam, host, apiPort, { dropAudio, mode: eff }).then(() => {
      restartConnection()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.qualityMode, options?.soundEnabled, camera?.id])

  const retry = useCallback(() => {
    const cam = cameraRef.current
    const opts = optsRef.current
    if (!cam) return
    const conn = connectionRef.current
    if (conn) {
      conn.retryNow()
    } else if (isCameraConfigured(cam) && opts?.enabled !== false) {
      setCameraStatus(cam.id, 'connecting', 'Mencoba lagi...')
      const config = loadConfig()
      const { host, apiPort } = config.settings.go2rtc
      const fresh = new StreamConnection(cam, host, apiPort, buildCallbacks(cam))
      connectionRef.current = fresh
      fresh.start()
    }
  }, [camera?.id])

  return { retry }
}