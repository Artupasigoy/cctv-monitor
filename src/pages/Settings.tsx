import { useState } from 'react'
import type { Camera } from '@/types/camera'
import type { AppConfig } from '@/types/settings'
import { loadConfig, saveConfig, resetConfig } from '@/services/configService'
import { applyConfigToGo2rtc } from '@/services/go2rtcConfigService'
import { go2rtcStreamName } from '@/services/streamService'
import { scanCameras, type ScannedCamera } from '@/services/scanService'

interface Props {
  onClose: () => void
}

type CredTarget = { kind: 'scan'; cam: ScannedCamera } | { kind: 'camera'; id: string }

export function Settings({ onClose }: Props) {
  const [config, setConfig] = useState<AppConfig>(() => loadConfig())
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<string>('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string>('')
  const [foundCameras, setFoundCameras] = useState<ScannedCamera[]>([])
  const [credTarget, setCredTarget] = useState<CredTarget | null>(null)
  const [credName, setCredName] = useState('')
  const [credUsername, setCredUsername] = useState('')
  const [credPassword, setCredPassword] = useState('')

  const persist = async (next: AppConfig) => {
    setSaving(true)
    try {
      await saveConfig(next)
    } finally {
      setSaving(false)
    }
  }

  const updateCamera = (index: number, patch: Partial<Camera>) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        cameras: prev.cameras.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      }
      void persist(next)
      return next
    })
  }

  const updateSetting = (patch: Partial<AppConfig['settings']>) => {
    setConfig((prev) => {
      const next = { ...prev, settings: { ...prev.settings, ...patch } }
      void persist(next)
      return next
    })
  }

  const applyToGo2rtc = async (cameras: Camera[]) => {
    setApplying(true)
    setApplyResult('')
    try {
      const results = await applyConfigToGo2rtc(
        cameras,
        config.settings.go2rtc.host,
        config.settings.go2rtc.apiPort,
      )
      const detected = results
        .filter((r) => r.detectedPath)
        .map((r) => {
          const idx = cameras.findIndex((c) => go2rtcStreamName(c.id) === r.name)
          return { idx, path: r.detectedPath! }
        })
      if (detected.length > 0) {
        const nextCameras = cameras.map((c, i) => {
          const d = detected.find((x) => x.idx === i)
          return d && !c.rtspPath ? { ...c, rtspPath: d.path } : c
        })
        const next = { ...config, cameras: nextCameras }
        setConfig(next)
        await saveConfig(next)
      }
      const okCount = results.filter((r) => r.ok).length
      const failCount = results.filter((r) => !r.ok).length
      const fails = results
        .filter((r) => !r.ok)
        .map((r) => `${r.name}: ${r.error ?? `HTTP ${r.status}`}`)
        .join('; ')
      setApplyResult(
        `Terapkan: ${okCount} berhasil, ${failCount} gagal${fails ? ` — ${fails}` : ''}`,
      )
    } catch (e) {
      setApplyResult(`Gagal menerapkan: ${String(e)}`)
    } finally {
      setApplying(false)
    }
  }

  const handleApply = () => {
    void applyToGo2rtc(config.cameras)
  }

  const handleRemoveCredentials = (index: number) => {
    setConfig((prev) => {
      const next = {
        ...prev,
        cameras: prev.cameras.map((c, i) =>
          i === index ? { ...c, username: '', password: '', passwordEnc: undefined } : c,
        ),
      }
      void persist(next)
      return next
    })
  }

  const handleRemoveCamera = (id: string) => {
    setConfig((prev) => {
      const next = { ...prev, cameras: prev.cameras.filter((c) => c.id !== id) }
      void persist(next)
      return next
    })
  }

  const handleReset = () => {
    const fresh = resetConfig()
    setConfig(fresh)
    void persist(fresh)
  }

  const handleScan = async () => {
    setScanning(true)
    setScanResult('')
    setFoundCameras([])
    try {
      const res = await scanCameras()
      if (res.error) {
        setScanResult(res.error)
        return
      }
      setFoundCameras(res.found)
      setScanResult(
        res.found.length === 0
          ? 'Tidak ada kamera ditemukan.'
          : `${res.found.length} kamera ditemukan. Klik kamera untuk memasukkan kredensial.`,
      )
    } catch (e) {
      setScanResult(`Scan gagal: ${String(e)}`)
    } finally {
      setScanning(false)
    }
  }

  const openCred = (target: CredTarget, defaultName: string) => {
    setCredTarget(target)
    setCredName(defaultName)
    setCredUsername('')
    setCredPassword('')
  }

  const handleSaveCredential = async () => {
    if (!credTarget) return
    const username = credUsername.trim()
    let nextCameras: Camera[]

    if (credTarget.kind === 'scan') {
      const s = credTarget.cam
      const exists = config.cameras.find((c) => c.host === s.host && c.port === s.port)
      const newCam: Camera = {
        id: exists?.id ?? `cam_${Date.now()}_${s.host.replace(/\./g, '_')}`,
        name: credName.trim() || s.name || `Kamera ${s.host}`,
        host: s.host,
        port: s.port,
        rtspPath: '',
        username,
        password: credPassword,
        enabled: true,
        qualityMode: 'auto',
      }
      nextCameras = exists
        ? config.cameras.map((c) => (c.id === exists.id ? { ...c, ...newCam } : c))
        : [...config.cameras, newCam]
    } else {
      nextCameras = config.cameras.map((c) =>
        c.id === credTarget.id ? { ...c, username, password: credPassword } : c,
      )
    }

    const next = { ...config, cameras: nextCameras }
    await persist(next)
    setConfig(loadConfig())
    setCredTarget(null)
    void applyToGo2rtc(nextCameras)
  }

  const isInConfig = (s: ScannedCamera) =>
    config.cameras.some((c) => c.host === s.host && c.port === s.port)

  return (
    <div className="settings-overlay">
      <div className="settings">
        <header className="settings-header">
          <div className="settings-title">Settings</div>
          <button type="button" className="tile-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <h2>Kamera</h2>
            <div className="cam-form-scanbar">
              <button type="button" className="btn-secondary" onClick={handleScan} disabled={scanning || applying}>
                {scanning ? 'Memindai…' : 'Scan Kamera'}
              </button>
              <span className="cam-form-scanbar-hint">
                Deteksi otomatis kamera aktif di LAN. Tidak perlu tahu IP/port.
              </span>
            </div>
            {scanResult && <div className="settings-scan-result">{scanResult}</div>}

            {foundCameras.length > 0 && (
              <div className="scan-list">
                {foundCameras.map((s) => (
                  <div className="scan-item" key={`${s.host}:${s.port}`}>
                    <div className="scan-item-info">
                      <span className="scan-item-host">{s.name ?? `Kamera ${s.host}`}</span>
                      <span className="scan-item-ports">
                        {s.host} · port {s.ports?.join(', ') ?? s.port}
                      </span>
                    </div>
                    {isInConfig(s) ? (
                      <span className="scan-item-added">Sudah ditambahkan</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => openCred({ kind: 'scan', cam: s }, s.name ?? `Kamera ${s.host}`)}
                      >
                        Masukkan Kredensial
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {credTarget && (
              <div className="cam-form">
                <div className="cam-form-title">
                  <span>Kredensial</span>
                </div>
                <div className="cam-form-grid">
                  <label>
                    Nama
                    <input
                      type="text"
                      value={credName}
                      autoComplete="off"
                      onChange={(e) => setCredName(e.target.value)}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      type="text"
                      value={credUsername}
                      autoComplete="off"
                      onChange={(e) => setCredUsername(e.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={credPassword}
                      autoComplete="new-password"
                      onChange={(e) => setCredPassword(e.target.value)}
                    />
                  </label>
                </div>
                <div className="cam-form-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveCredential}
                    disabled={applying}
                  >
                    {applying ? 'Menerapkan…' : 'Simpan & Terapkan'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setCredTarget(null)}>
                    Batal
                  </button>
                </div>
              </div>
            )}

            {config.cameras.map((cam, i) => (
              <div className="cam-form" key={cam.id}>
                <div className="cam-form-title">
                  <span>{cam.name}</span>
                  <label className="cam-form-enabled">
                    <input
                      type="checkbox"
                      checked={cam.enabled}
                      onChange={(e) => updateCamera(i, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>
                <div className="cam-form-info">
                  {cam.host ? (
                    <span className="cam-form-host">{cam.host}:{cam.port}</span>
                  ) : (
                    <span className="cam-form-host cam-form-host-empty">belum di-scan</span>
                  )}
                  {cam.rtspPath && <span className="cam-form-path">{cam.rtspPath}</span>}
                </div>
                {cam.passwordEnc ? (
                  <div className="cam-form-creds">
                    <span className="cam-form-creds-hint">Kredensial tersimpan (terenkripsi)</span>
                    <div className="cam-form-creds-actions">
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() => handleRemoveCredentials(i)}
                      >
                        Hapus Kredensial
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        onClick={() => openCred({ kind: 'camera', id: cam.id }, cam.name)}
                      >
                        Ganti
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="cam-form-creds cam-form-creds-empty">
                    <span className="cam-form-creds-hint">Belum ada kredensial</span>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => openCred({ kind: 'camera', id: cam.id }, cam.name)}
                    >
                      Masukkan Kredensial
                    </button>
                  </div>
                )}
                <div className="cam-form-actions">
                  <button
                    type="button"
                    className="btn-danger btn-small"
                    onClick={() => handleRemoveCamera(cam.id)}
                  >
                    Hapus Kamera
                  </button>
                </div>
              </div>
            ))}

            {config.cameras.length === 0 && foundCameras.length === 0 && !scanResult && (
              <div className="settings-empty">
                Belum ada kamera. Tekan <strong>Scan Kamera</strong> untuk mendeteksi kamera di jaringan.
              </div>
            )}
          </section>

          <section className="settings-section">
            <h2>Aplikasi</h2>
            <div className="cam-form-grid">
              <label>
                Default Layout
                <select
                  value={config.settings.defaultLayout}
                  onChange={(e) => updateSetting({ defaultLayout: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>
            </div>
            <div className="settings-info">
              <div>
                <span className="settings-info-label">Streaming server</span>
                <span className="settings-info-value">{config.settings.go2rtc.host}:{config.settings.go2rtc.apiPort}</span>
              </div>
              <div>
                <span className="settings-info-label">Scan jaringan</span>
                <span className="settings-info-value">otomatis (deteksi subnet)</span>
              </div>
            </div>
          </section>
        </div>

        <footer className="settings-footer">
          <button type="button" className="btn-secondary" onClick={handleApply} disabled={applying || saving}>
            {applying ? 'Menerapkan…' : 'Terapkan ke go2rtc'}
          </button>
          <button type="button" className="btn-danger" onClick={handleReset}>
            Reset ke Default
          </button>
          <button type="button" className="btn-primary" onClick={onClose} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Selesai'}
          </button>
        </footer>
        {applyResult && <div className="settings-apply-result">{applyResult}</div>}
      </div>
    </div>
  )
}
