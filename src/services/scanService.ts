import { loadConfig } from './configService'

export interface ScannedCamera {
  host: string
  port: number
  /** Port terbuka yang terdeteksi (mis. [554, 8000]). */
  ports?: number[]
  rtspPath?: string
  /** Nama default yang disarankan. */
  name?: string
}

export interface ScanOptions {
  /** Rentang host yang discan. Kosong = pakai settings.scan.range / auto-detect. */
  range?: string
}

export interface ScanResult {
  found: ScannedCamera[]
  error?: string
}

/**
 * Scan kamera di LAN.
 *
 * Browser tidak bisa melakukan TCP scan, jadi scan dilakukan oleh komponen host:
 * - Dev: scan server Node (scripts/scan-server.mjs) via HTTP.
 * - Produksi: launcher Go (launcher/) menyediakan endpoint /scan yang sama.
 * UI hanya bergantung pada `scanCameras`, sehingga implementasi bisa diganti tanpa ubah UI.
 */
async function httpScanner(options?: ScanOptions): Promise<ScanResult> {
  const config = loadConfig()
  const host = config.settings.go2rtc.host
  const { port, range } = config.settings.scan
  const effectiveRange = options?.range ?? range
  const query = effectiveRange ? `?range=${encodeURIComponent(effectiveRange)}` : ''

  try {
    const res = await fetch(`http://${host}:${port}/scan${query}`, { signal: AbortSignal.timeout(120000) })
    if (!res.ok) {
      return { found: [], error: `Scan server HTTP ${res.status}` }
    }
    const data = (await res.json()) as { found?: Array<{ host: string; ports: number[] }>; error?: string }
    if (data.error) return { found: [], error: data.error }
    const found: ScannedCamera[] = (data.found ?? [])
      .filter((s) => s.ports?.includes(554))
      .map((s) => ({
        host: s.host,
        port: 554,
        name: `Kamera ${s.host}`,
      }))
    return { found }
  } catch (e) {
    return { found: [], error: `Scan server tidak dapat diakses: ${String(e)}` }
  }
}

let scanner: (options?: ScanOptions) => Promise<ScanResult> = httpScanner

export async function scanCameras(options?: ScanOptions): Promise<ScanResult> {
  return scanner(options)
}
