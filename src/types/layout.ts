export type LayoutCount = 1 | 2 | 3 | 4

export interface CameraSlot {
  id: string
  cameraId: string | null
}

export interface Layout {
  count: LayoutCount
  slots: CameraSlot[]
}

export function createLayout(count: LayoutCount, cameraIds: (string | null)[]): Layout {
  const slots: CameraSlot[] = []
  for (let i = 0; i < count; i++) {
    slots.push({ id: `slot-${i + 1}`, cameraId: cameraIds[i] ?? null })
  }
  return { count, slots }
}
