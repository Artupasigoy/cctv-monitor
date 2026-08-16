import { useCallback, useRef } from 'react'
import type { Camera } from '@/types/camera'
import { StatusIndicator } from './StatusIndicator'
import { CameraSelector } from './CameraSelector'
import { useStream } from '@/hooks/useStream'
import { useCamera } from '@/hooks/useCamera'
import { useFullscreen } from '@/hooks/useFullscreen'

interface Props {
  slotLabel: string
  camera: Camera | null
  cameras: Camera[]
  soundEnabled: boolean
  onSelectCamera: (cameraId: string | null) => void
}

export function CameraTile({ slotLabel, camera, cameras, soundEnabled, onSelectCamera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { camera: cameraInfo, status } = useCamera(camera?.id ?? null)
  const { isFullscreen, toggle, fullscreenRef } = useFullscreen()

  const { retry } = useStream(camera, videoRef)

  const currentCamera = camera ?? cameraInfo
  const showPlaceholder = !camera || !camera.host || !camera.rtspPath
  const isActive = Boolean(camera && camera.host && camera.rtspPath)

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      toggle()
    },
    [toggle],
  )

  return (
    <div className={`tile${isFullscreen ? ' is-fullscreen' : ''}`} ref={fullscreenRef} onDoubleClick={handleDoubleClick}>
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
        {(status.status === 'offline' || status.status === 'error' || status.status === 'reconnecting') && isActive && (
          <button type="button" className="tile-btn tile-retry" title={status.lastError ?? 'Coba koneksi ulang'} onClick={retry}>
            ↻ Coba Lagi
          </button>
        )}
        <button type="button" className="tile-btn" title="Fullscreen" onClick={toggle}>
          ⛶
        </button>
      </div>

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
