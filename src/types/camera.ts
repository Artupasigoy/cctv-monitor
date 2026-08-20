export type CameraStatus =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'reconnecting'
  | 'error'

export type QualityMode = 'high' | 'low' | 'auto'

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
  /** Mode kualitas per kamera: high (main), low (sub), auto (otomatis sesuai jaringan). Default: auto. */
  qualityMode: QualityMode
  /** RTSP path. Boleh kosong (""): aplikasi auto-detect dari daftar kandidat EZVIZ. */
  rtspPath: string
}

export interface CameraStatusInfo {
  status: CameraStatus
  message?: string
  lastError?: string
  streamUrl?: string
}
