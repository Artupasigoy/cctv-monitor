export interface Go2rtcConfig {
  host: string
  apiPort: number
}

export interface ScanConfig {
  /** Port HTTP scan server lokal (scan-server.mjs dev / launcher Go /scan). */
  port: number
  /** Rentang scan. Kosong = auto-detect subnet host. Contoh: "192.168.18.1-254". */
  range: string
}

export interface ApplicationSettings {
  defaultLayout: 1 | 2 | 3 | 4
  defaultCameraAssignment: Record<string, string | null>
  /** Suara live CCTV. Default NONAKTIF (false) — tampilkan ikon speaker tercoret. */
  soundEnabled: boolean
  autoStart: boolean
  startMinimized: boolean
  theme: 'dark' | 'light'
  go2rtc: Go2rtcConfig
  scan: ScanConfig
}

export interface AppConfig {
  version: number
  cameras: import('./camera').Camera[]
  settings: ApplicationSettings
}
