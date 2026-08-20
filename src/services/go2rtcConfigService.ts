import type { Camera, QualityMode } from '@/types/camera'
import { go2rtcStreamName } from './streamService'
import { loadConfig } from './configService'
import { getCameraPassword } from './configService'

export interface Go2rtcYamlOptions {
  apiListen: string
  rtspListen: string
  webrtcListen: string
  useH264Filter?: boolean
  dropAudio?: boolean
}

export interface Go2rtcApplyResult {
  name: string
  ok: boolean
  status: number
  error?: string
  detectedPath?: string
}

export interface PathDetectResult {
  path: string | null
  authError: boolean
  error?: string
}

const DEFAULT_OPTIONS: Go2rtcYamlOptions = {
  apiListen: ':1984',
  rtspListen: ':8554',
  webrtcListen: ':8555',
}

/** Kandidat RTSP path umum untuk kamera EZVIZ/Hikvision, dicoba berurutan saat auto-detect. */
export const EZVIZ_RTSP_PATHS = [
  '/Streaming/Channels/101',
  '/h264',
  '/live',
  '/ch1/main/av_stream',
  '/stream1',
  '/onvif1',
  '/media/video1',
  '/Streaming/Channels/102',
]

function yamlEscape(value: string): string {
  if (/^[a-zA-Z0-9_./:+\-]+$/.test(value)) return value
  return JSON.stringify(value)
}

function rtspUrlForPath(cam: Camera, password: string, path: string, dropAudio = false): string {
  const creds = cam.username ? `${encodeURIComponent(cam.username)}:${encodeURIComponent(password)}@` : ''
  return `rtsp://${creds}${cam.host}:${cam.port}${path}${dropAudio ? '?video' : ''}`
}

function rtspUrlFor(cam: Camera, password: string, dropAudio = false): string {
  return rtspUrlForPath(cam, password, cam.rtspPath, dropAudio)
}

/** Map path main↔sub untuk EZVIZ/Hikvision. Return null bila pola path tidak dikenal. */
export function mapQualityPath(path: string, mode: QualityMode): string | null {
  const mainStreaming = '/Streaming/Channels/101'
  const subStreaming = '/Streaming/Channels/102'
  const isHigh = mode === 'high' || mode === 'auto'
  if (path.includes(mainStreaming)) return isHigh ? mainStreaming : subStreaming
  if (path.includes(subStreaming)) return isHigh ? mainStreaming : subStreaming
  if (path.includes('/ch1/main/av_stream')) return isHigh ? path : '/ch1/sub/av_stream'
  if (path.includes('/ch1/sub/av_stream')) return isHigh ? '/ch1/main/av_stream' : path
  return null
}

/** RTSP URL sesuai mode kualitas. Bila sub tidak tersedia → return null (fallback ke high). */
export function rtspUrlForMode(
  cam: Camera,
  password: string,
  mode: QualityMode,
  dropAudio = false,
): string | null {
  if (mode === 'high' || mode === 'auto') return rtspUrlFor(cam, password, dropAudio)
  const mapped = mapQualityPath(cam.rtspPath, mode)
  if (mapped === null) return null
  return rtspUrlForPath(cam, password, mapped, dropAudio)
}

async function probeStream(
  name: string,
  apiHost: string,
  apiPort: number,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `http://${apiHost}:${apiPort}/api/streams?src=${encodeURIComponent(name)}&video=all&audio=all`,
      { signal: ctrl.signal },
    )
    const text = await res.text()
    if (text.trim().startsWith('{')) return { ok: true }
    const msg = text.trim().replace(/^streams:\s*/, '')
    return { ok: false, error: msg || `HTTP ${res.status}` }
  } catch {
    return { ok: false, error: 'timeout/aborted' }
  } finally {
    window.clearTimeout(timer)
  }
}

/**
 * Auto-detect RTSP path yang berhasil untuk kamera EZVIZ.
 * Password hanya transit browser -> go2rtc (local), tidak pernah di-log / tampil.
 */
export async function detectRtspPath(
  cam: Camera,
  apiHost: string,
  apiPort: number,
  candidatePaths: string[] = EZVIZ_RTSP_PATHS,
): Promise<PathDetectResult> {
  const name = go2rtcStreamName(cam.id)
  const password = await getCameraPassword(cam)
  const paths = cam.rtspPath ? [cam.rtspPath] : candidatePaths

  for (const path of paths) {
    const url = rtspUrlForPath(cam, password, path)
    try {
      await fetch(
        `http://${apiHost}:${apiPort}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`,
        { method: 'PUT' },
      )
    } catch (e) {
      return { path: null, authError: false, error: String(e) }
    }
    const probe = await probeStream(name, apiHost, apiPort, 10000)
    if (probe.ok) return { path, authError: false }
    const authError = /user\/pass|unauthor|auth/i.test(probe.error ?? '')
    if (authError) return { path: null, authError: true, error: probe.error }
  }
  return { path: null, authError: false, error: 'Tidak ada path RTSP yang merespons' }
}

/** Terapkan config kamera ke go2rtc via REST API (PUT /api/streams). Password tidak pernah di-log. */
export async function applyConfigToGo2rtc(
  cameras: Camera[],
  apiHost: string,
  apiPort: number,
  options: { dropAudio?: boolean } = {},
): Promise<Go2rtcApplyResult[]> {
  const results: Go2rtcApplyResult[] = []
  for (const cam of cameras) {
    const name = go2rtcStreamName(cam.id)
    if (!cam.enabled || !cam.host) {
      results.push({ name, ok: false, status: 0, error: 'disabled or incomplete' })
      continue
    }
    const password = await getCameraPassword(cam)
    const mode = cam.qualityMode ?? 'auto'
    if (!cam.rtspPath) {
      const detect = await detectRtspPath(cam, apiHost, apiPort)
      if (!detect.path) {
        results.push({
          name,
          ok: false,
          status: 0,
          error: detect.authError ? 'Auth gagal: periksa username/password' : `Path tidak ditemukan: ${detect.error}`,
        })
        continue
      }
      const camWithPath = { ...cam, rtspPath: detect.path }
      const url = rtspUrlForMode(camWithPath, password, mode, options.dropAudio) ?? rtspUrlFor(camWithPath, password, options.dropAudio)
      try {
        await fetch(
          `http://${apiHost}:${apiPort}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`,
          { method: 'PUT' },
        )
        results.push({ name, ok: true, status: 200, detectedPath: detect.path })
      } catch (e) {
        results.push({ name, ok: false, status: 0, error: String(e) })
      }
      continue
    }
    const url = rtspUrlForMode(cam, password, mode, options.dropAudio) ?? rtspUrlFor(cam, password, options.dropAudio)
    try {
      const res = await fetch(`http://${apiHost}:${apiPort}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`, {
        method: 'PUT',
      })
      const text = await res.text()
      if (res.ok) {
        results.push({ name, ok: true, status: res.status })
      } else {
        results.push({ name, ok: false, status: res.status, error: text.slice(0, 200) })
      }
    } catch (e) {
      results.push({ name, ok: false, status: 0, error: String(e) })
    }
  }
  return results
}

/** Apply ulang source satu kamera ke go2rtc sesuai mode kualitas & dropAudio. Dipakai saat switch runtime. */
export async function applyCameraSource(
  cam: Camera,
  apiHost: string,
  apiPort: number,
  options: { dropAudio?: boolean; mode?: QualityMode } = {},
): Promise<boolean> {
  if (!cam.enabled || !cam.host || !cam.rtspPath) return false
  const password = await getCameraPassword(cam)
  const mode = options.mode ?? cam.qualityMode ?? 'auto'
  const url = rtspUrlForMode(cam, password, mode, options.dropAudio)
  if (!url) return false
  const name = go2rtcStreamName(cam.id)
  try {
    const res = await fetch(
      `http://${apiHost}:${apiPort}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(url)}`,
      { method: 'PUT' },
    )
    return res.ok
  } catch {
    return false
  }
}

/** Tersedia mode low untuk kamera ini (pola path substream dikenali). */
export function isLowAvailable(cam: Camera): boolean {
  return mapQualityPath(cam.rtspPath ?? '', 'low') !== null
}

export async function generateGo2rtcYaml(
  cameras: Camera[],
  options: Partial<Go2rtcYamlOptions> = {},
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const enabled = cameras.filter((c) => c.enabled && c.host && c.rtspPath)

  const lines: string[] = []
  lines.push('# Generated by CCTV Monitor. Do not edit manually.')
  lines.push(`api:\n  listen: ${opts.apiListen}\n  origin: "*"`)
  lines.push(`rtsp:\n  listen: ${opts.rtspListen}`)
  lines.push(`webrtc:\n  listen: ${opts.webrtcListen}`)
  lines.push('streams:')

  if (enabled.length === 0) {
    lines.push('  # (no enabled cameras)')
  } else {
    for (const cam of enabled) {
      const name = go2rtcStreamName(cam.id)
      const password = await getCameraPassword(cam)
      const creds = cam.username
        ? `${yamlEscape(cam.username)}:${yamlEscape(password)}@`
        : ''
      const dropAudio = opts.dropAudio ?? false
      const path = mapQualityPath(cam.rtspPath, cam.qualityMode ?? 'auto') ?? cam.rtspPath
      const url = `rtsp://${creds}${yamlEscape(cam.host)}:${cam.port}${yamlEscape(path)}${dropAudio ? '?video' : ''}`
      lines.push(`  ${name}: ${url}`)
    }
  }

  return lines.join('\n') + '\n'
}

export function downloadYamlFile(yaml: string, filename = 'go2rtc.yaml'): void {
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Cek apakah service go2rtc sudah siap melayani request HTTP. */
export async function isGo2rtcReady(apiHost: string, apiPort: number, timeoutMs = 8000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`http://${apiHost}:${apiPort}/api/streams`, { signal: ctrl.signal, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

/** Re-apply semua stream kamera ter-konfigurasi ke go2rtc. Dipanggil launcher
 * saat app start supaya kamera langsung tersedia kembali setelah restart
 * (go2rtc di-spawn fresh oleh launcher setiap startup, sehingga stream
 * yang ada tidak persist otomatis). */
export async function applyConfiguredStreams(): Promise<void> {
  const config = loadConfig()
  const { host, apiPort } = config.settings.go2rtc

  // Tunggu go2rtc siap (mis. saat launcher baru saja start), retry.
  let ready = false
  for (let i = 0; i < 10; i++) {
    if (await isGo2rtcReady(host, apiPort, 2000)) {
      ready = true
      break
    }
    await sleep(1000)
  }
  if (!ready) {
    console.log('[go2rtc] tidak siap saat startup; dependekan koneksi WebRTC reconnect')
    return
  }

  const readyCams = config.cameras.filter(
    (c) => c.enabled && c.host && (c.username || c.passwordEnc || c.password) && c.rtspPath,
  )
  if (readyCams.length === 0) return
  try {
    await applyConfigToGo2rtc(readyCams, host, apiPort, { dropAudio: !config.settings.soundEnabled })
    console.log(`[go2rtc] re-apply ${readyCams.length} stream pada startup`)
  } catch (e) {
    console.log('[go2rtc] re-apply gagal:', e)
  }
}
