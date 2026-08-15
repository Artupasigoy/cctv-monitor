export type CameraStatus =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'reconnecting'
  | 'error'

export interface EncryptedText {
  iv: string
  data: string
}

export interface Camera {
  id: string
  name: string
  host: string
  port: number
  username: string
  /** Plaintext password. HANYA buffer input di memori — JANGAN pernah di-persist. */
  password: string
  /** Password terenkripsi (AES-GCM) untuk disimpan. Jangan pernah berisi plaintext. */
  passwordEnc?: EncryptedText
  enabled: boolean
  preferredStream?: 'main' | 'sub'
  /** RTSP path. Boleh kosong (""): aplikasi auto-detect dari daftar kandidat EZVIZ. */
  rtspPath: string
}

export interface CameraStatusInfo {
  status: CameraStatus
  message?: string
  lastError?: string
  streamUrl?: string
}
