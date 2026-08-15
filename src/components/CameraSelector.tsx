import type { Camera } from '@/types/camera'

interface Props {
  cameras: Camera[]
  value: string | null
  label: string
  onChange: (cameraId: string | null) => void
}

export function CameraSelector({ cameras, value, label, onChange }: Props) {
  return (
    <select
      className="camera-select"
      value={value ?? ''}
      aria-label={label}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {cameras.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
