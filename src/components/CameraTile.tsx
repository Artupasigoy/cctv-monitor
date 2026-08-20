import { useCallback, useEffect, useRef, useState } from 'react'
import type { Camera, QualityMode } from '@/types/camera'
import { StatusIndicator } from './StatusIndicator'
import { CameraSelector } from './CameraSelector'
import { useStream } from '@/hooks/useStream'
import { useCamera } from '@/hooks/useCamera'
import { useFullscreen } from '@/hooks/useFullscreen'
import { isLowAvailable } from '@/services/go2rtcConfigService'

const IDLE_HIDE_MS = 4000

interface Props {
  slotLabel: string
  camera: Camera | null
  cameras: Camera[]
  soundEnabled: boolean
  onSelectCamera: (cameraId: string | null) => void
  onQualityModeChange: (cameraId: string, mode: QualityMode) => void
}

export function CameraTile({
  slotLabel,
  camera,
  cameras,
  soundEnabled,
  onSelectCamera,
  onQualityModeChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const idleTimer = useRef<number | undefined>(undefined)
  const [controlsHidden, setControlsHidden] = useState(false)
  const [weakSignal, setWeakSignal] = useState(false)
  const [effectiveMode, setEffectiveMode] = useState<'high' | 'low'>('high')
  const { camera: cameraInfo, status } = useCamera(camera?.id ?? null)
  const { isFullscreen, toggle, fullscreenRef } = useFullscreen()

  const { retry } = useStream(camera, videoRef, {
    qualityMode: camera?.qualityMode,
    soundEnabled,
    onWeakSignal: setWeakSignal,
    onEffectiveModeChange: setEffectiveMode,
  })

  const currentCamera = camera ?? cameraInfo
  const showPlaceholder = !camera || !camera.host || !camera.rtspPath
  const isActive = Boolean(camera && camera.host && camera.rtspPath)
  const qualityMode = camera?.qualityMode ?? 'auto'
  const lowAvailable = camera ? isLowAvailable(camera) : false

  const handleMouseMove = useCallback(() => {
    setControlsHidden(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setControlsHidden(true), IDLE_HIDE_MS)
  }, [])

  useEffect(() => {
    handleMouseMove()
    return () => window.clearTimeout(idleTimer.current)
  }, [handleMouseMove])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      toggle()
    },
    [toggle],
  )

  const handleQuality = (mode: QualityMode) => {
    if (!camera) return
    onQualityModeChange(camera.id, mode)
  }

  return (
    <div
      className={`tile${isFullscreen ? ' is-fullscreen' : ''}${controlsHidden ? ' controls-hidden' : ''}`}
      ref={fullscreenRef}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
    >
      <div className="tile-video-wrap">
        {!showPlaceholder ? (
          <video ref={videoRef} className="tile-video" autoPlay playsInline muted={!soundEnabled} />
        ) : (
          <div className="tile-placeholder">
            <div className="tile-empty-title">{currentCamera ? 'Kamera belum dikonfigurasi' : 'Kosong'}</div>
            <div className="tile-empty-sub">Klik untuk memilih kamera</div>
          </div>
        )}
      </div>

      <div className="tile-topbar">
        <span className="tile-name">{currentCamera?.name ?? `Slot ${slotLabel}`}</span>
        {isActive ? (
          <StatusIndicator status={status.status} />
        ) : (
          <span className="status status-idle">IDLE</span>
        )}
      </div>

      <div className="tile-controls">
        <CameraSelector cameras={cameras} value={camera?.id ?? null} label={`Kamera slot ${slotLabel}`} onChange={onSelectCamera} />
        {isActive && (
          <div className="tile-quality" role="group" aria-label="Kualitas video">
            <button
              type="button"
              className={`tile-quality-btn${qualityMode === 'high' ? ' is-active' : ''}`}
              onClick={() => handleQuality('high')}
              title="Resolusi tinggi (main stream)"
            >
              HD
            </button>
            <button
              type="button"
              className={`tile-quality-btn${qualityMode === 'low' ? ' is-active' : ''}`}
              onClick={() => handleQuality('low')}
              disabled={!lowAvailable}
              title={lowAvailable ? 'Resolusi rendah (sub stream, hemat bandwidth)' : 'Sub stream tidak tersedia untuk kamera ini'}
            >
              LOW
            </button>
            <button
              type="button"
              className={`tile-quality-btn${qualityMode === 'auto' ? ' is-active' : ''}`}
              onClick={() => handleQuality('auto')}
              title="Otomatis: high bila lancar, low bila lemah"
            >
              AUTO{qualityMode === 'auto' ? ` · ${effectiveMode.toUpperCase()}` : ''}
            </button>
          </div>
        )}
        {(status.status === 'offline' || status.status === 'error' || status.status === 'reconnecting') && isActive && (
          <button type="button" className="tile-btn tile-retry" title={status.lastError ?? 'Coba koneksi ulang'} onClick={retry}>
            ↻ Coba Lagi
          </button>
        )}
      </div>

      <button type="button" className="tile-fs-btn" title="Fullscreen" onClick={toggle}>
        <span className="tile-fs-icon" aria-hidden="true">⛶</span>
        <span>Fullscreen</span>
      </button>

      {weakSignal && isActive && qualityMode === 'high' && (
        <div className="tile-weak-hint">⚠️ Koneksi lemah — turunkan ke mode Low</div>
      )}

      {status.message && isActive && (
        <div className="tile-status-msg" title={status.lastError ?? status.message}>
          {status.message}
        </div>
      )}

      {isFullscreen && (
        <div className="tile-fs-hint">
          <button type="button" className="tile-btn" onClick={toggle}>
            ✕
          </button>
          <span>Tekan Esc untuk keluar</span>
        </div>
      )}
    </div>
  )
}