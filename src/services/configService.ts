import type { AppConfig, ApplicationSettings } from '@/types/settings'
import type { Camera } from '@/types/camera'
import defaultConfig from '../../config.example.json'
import { encryptText, decryptText } from './secureStore'

const STORAGE_KEY = 'cctv-monitor:config'

export function getDefaultConfig(): AppConfig {
  return JSON.parse(JSON.stringify(defaultConfig)) as AppConfig
}

async function encryptCameraSecrets(cameras: Camera[]): Promise<Camera[]> {
  return Promise.all(
    cameras.map(async (cam) => {
      if (cam.password) {
        const passwordEnc = await encryptText(cam.password)
        return { ...cam, passwordEnc, password: '' }
      }
      return { ...cam, password: '' }
    }),
  )
}

export async function getCameraPassword(camera: Camera): Promise<string> {
  if (camera.password) return camera.password
  if (camera.passwordEnc) {
    try {
      return await decryptText(camera.passwordEnc)
    } catch {
      return ''
    }
  }
  return ''
}

export function getStoredConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppConfig
  } catch {
    return null
  }
}

export function loadConfig(): AppConfig {
  const stored = getStoredConfig()
  if (!stored) return getDefaultConfig()
  const defaults = getDefaultConfig().settings
  const settings: ApplicationSettings = { ...defaults, ...stored.settings }
  const cameras = (stored.cameras ?? []).map((c) =>
    c.qualityMode ? c : { ...c, qualityMode: 'auto' as const },
  )
  return { ...stored, cameras, settings }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const clean = { ...config, cameras: await encryptCameraSecrets(config.cameras) }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
}

export function resetConfig(): AppConfig {
  localStorage.removeItem(STORAGE_KEY)
  return getDefaultConfig()
}

export async function updateCameras(cameras: Camera[]): Promise<AppConfig> {
  const cfg = loadConfig()
  cfg.cameras = cameras
  await saveConfig(cfg)
  return cfg
}

export async function updateSettings(settings: ApplicationSettings): Promise<AppConfig> {
  const cfg = loadConfig()
  cfg.settings = settings
  await saveConfig(cfg)
  return cfg
}

export async function rtspUrl(camera: Camera): Promise<string | null> {
  if (!camera.host || !camera.rtspPath) return null
  const password = await getCameraPassword(camera)
  const creds = camera.username ? `${encodeURIComponent(camera.username)}:${encodeURIComponent(password)}@` : ''
  return `rtsp://${creds}${camera.host}:${camera.port}${camera.rtspPath}`
}
