import type { Camera } from '@/types/camera'
import { useCamera } from '@/hooks/useCamera'

interface Props {
  cameras: Camera[]
  assignedCameraIds: Set<string>
  onToggleCamera: (cameraId: string) => void
}

export function CameraList({ cameras, assignedCameraIds, onToggleCamera }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">Kamera Saya</div>
      <div className="sidebar-list">
        {cameras.map((cam) => (
          <CameraListItem
            key={cam.id}
            camera={cam}
            isAssigned={assignedCameraIds.has(cam.id)}
            onToggle={onToggleCamera}
          />
        ))}
        {cameras.length === 0 && <div className="sidebar-empty">Tidak ada kamera aktif</div>}
      </div>
    </aside>
  )
}

function CameraListItem({
  camera,
  isAssigned,
  onToggle,
}: {
  camera: Camera
  isAssigned: boolean
  onToggle: (cameraId: string) => void
}) {
  const { status } = useCamera(camera.id)

  return (
    <div className={`sidebar-item${isAssigned ? ' active' : ''}`}>
      <span className={`sidebar-status status-dot status-dot-${status.status}`} />
      <span className="sidebar-name" title={camera.name}>
        {camera.name}
      </span>
      <button
        type="button"
        className={`sidebar-play${isAssigned ? ' playing' : ''}`}
        title={isAssigned ? 'Hapus dari tampilan' : 'Tampilkan di grid'}
        onClick={() => onToggle(camera.id)}
      >
        {isAssigned ? '■' : '▶'}
      </button>
    </div>
  )
}
