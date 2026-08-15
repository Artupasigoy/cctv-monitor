import type { Camera } from '@/types/camera'
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
  onSelectCamera: (slotId: string, cameraId: string | null) => void
}

export function CameraGrid({ layout, cameras, onSelectCamera }: Props) {
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
            onSelectCamera={(cameraId) => onSelectCamera(slot.id, cameraId)}
          />
        )
      })}
    </div>
  )
}
