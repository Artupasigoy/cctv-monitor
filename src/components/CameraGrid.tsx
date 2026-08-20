import type { Camera, QualityMode } from '@/types/camera'
import type { LayoutCount } from '@/types/layout'
import { CameraTile } from './CameraTile'

interface LayoutSlot {
  id: string
  cameraId: string | null
  label: string
}

interface Props {
  layout: { count: LayoutCount; slots: LayoutSlot[] }
  cameras: Camera[]
  soundEnabled: boolean
  onSelectCamera: (slotId: string, cameraId: string | null) => void
  onQualityModeChange: (cameraId: string, mode: QualityMode) => void
}

export function CameraGrid({ layout, cameras, soundEnabled, onSelectCamera, onQualityModeChange }: Props) {
  return (
    <div className={`grid grid-${layout.count}`}>
      {layout.slots.map((slot) => {
        const camera = slot.cameraId ? cameras.find((c) => c.id === slot.cameraId) ?? null : null
        return (
          <CameraTile
            key={slot.id}
            slotLabel={slot.label}
            camera={camera}
            cameras={cameras}
            soundEnabled={soundEnabled}
            onSelectCamera={(cameraId) => onSelectCamera(slot.id, cameraId)}
            onQualityModeChange={onQualityModeChange}
          />
        )
      })}
    </div>
  )
}