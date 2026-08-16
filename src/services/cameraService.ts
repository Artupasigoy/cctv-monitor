import type { Camera, CameraStatus, CameraStatusInfo } from '@/types/camera'
import type { AppConfig } from '@/types/settings'
import { loadConfig } from './configService'

export type StatusListener = (statuses: Map<string, CameraStatusInfo>) => void

const statuses = new Map<string, CameraStatusInfo>()
const listeners = new Set<StatusListener>()

export function setCameraStatus(cameraId: string, status: CameraStatus, message?: string): void {
  const prev = statuses.get(cameraId)
  const next: CameraStatusInfo = {
    ...(prev ?? {}),
    status,
    message,
    // Simpan pesan error terakhir untuk ditampilkan di UI (tooltip/status).
    lastError: status === 'online' ? undefined : (message ?? prev?.lastError),
  }
  statuses.set(cameraId, next)
  emit()
}

export function getCameraStatus(cameraId: string): CameraStatusInfo {
  return statuses.get(cameraId) ?? { status: 'idle' }
}

export function getCameraStatuses(): Map<string, CameraStatusInfo> {
  return new Map(statuses)
}

export function subscribeCameraStatuses(listener: StatusListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const l of listeners) l(getCameraStatuses())
}

export function getEnabledCameras(config: AppConfig): Camera[] {
  return config.cameras.filter((c) => c.enabled)
}

export function getCameras(): Camera[] {
  return loadConfig().cameras
}

export function isConfigured(camera: Camera): boolean {
  return Boolean(camera.host && camera.rtspPath && (camera.username || camera.passwordEnc || camera.password))
}
