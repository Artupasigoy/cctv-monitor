import type { CameraStatus } from '@/types/camera'

const LABELS: Record<CameraStatus, string> = {
  idle: 'IDLE',
  connecting: 'CONNECTING',
  online: 'ONLINE',
  offline: 'OFFLINE',
  reconnecting: 'RECONNECTING',
  error: 'ERROR',
}

interface Props {
  status: CameraStatus
}

export function StatusIndicator({ status }: Props) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" />
      {LABELS[status]}
    </span>
  )
}
