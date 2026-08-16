import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LayoutCount } from '@/types/layout'
import { CameraList } from '@/components/CameraList'
import { CameraGrid } from '@/components/CameraGrid'
import { LayoutSelector } from '@/components/LayoutSelector'
import { SpeakerIcon } from '@/components/SpeakerIcon'
import { useCameraStatusesSummary } from '@/hooks/useCameraStatusesSummary'
import { loadConfig, saveConfig } from '@/services/configService'

interface Props {
  onOpenSettings: () => void
}

export function Monitor({ onOpenSettings }: Props) {
  const [layout, setLayout] = useState<LayoutCount>(() => loadConfig().settings.defaultLayout)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => loadConfig().settings.soundEnabled)
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() => {
    const config = loadConfig()
    const cameraIds = config.cameras.filter((c) => c.enabled).map((c) => c.id)
    const fallback: Record<string, string | null> = {}
    for (let i = 0; i < 4; i++) fallback[`slot-${i + 1}`] = cameraIds[i] ?? null
    return { ...fallback, ...config.settings.defaultCameraAssignment }
  })

  const cameras = useMemo(() => loadConfig().cameras.filter((c) => c.enabled), [])
  const summary = useCameraStatusesSummary()

  const assignedCameraIds = useMemo(() => {
    return new Set(Object.values(assignments).filter((v): v is string => Boolean(v)))
  }, [assignments])

  const gridLayout = useMemo(() => {
    const slotIds = Array.from({ length: layout }, (_, i) => `slot-${i + 1}`)
    return {
      count: layout,
      slots: slotIds.map((id, i) => ({ id, cameraId: assignments[id] ?? null, label: `${i + 1}` })),
    }
  }, [layout, assignments])

  const handleSelectCamera = useCallback((slotId: string, cameraId: string | null) => {
    setAssignments((prev) => {
      const next = { ...prev, [slotId]: cameraId }
      if (cameraId) {
        for (const [id, cid] of Object.entries(next)) {
          if (id !== slotId && cid === cameraId) next[id] = null
        }
      }
      return next
    })
  }, [])

  const handleToggleCamera = useCallback(
    (cameraId: string) => {
      setAssignments((prev) => {
        const next = { ...prev }
        const slotIds = Object.keys(next).slice(0, 4)
        const existingSlot = slotIds.find((sid) => next[sid] === cameraId)
        if (existingSlot) {
          next[existingSlot] = null
          return next
        }
        const emptySlot = slotIds.find((sid) => !next[sid])
        if (emptySlot) {
          next[emptySlot] = cameraId
        }
        return next
      })
    },
    [],
  )

  const handleLayoutChange = useCallback((count: LayoutCount) => {
    setLayout(count)
  }, [])

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      const cfg = loadConfig()
      cfg.settings.soundEnabled = next
      void saveConfig(cfg)
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      const n = Number(e.key)
      if (n >= 1 && n <= 4) {
        setLayout(n as LayoutCount)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="monitor">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-logo" aria-hidden="true" />
          <span className="topbar-title">CCTV MONITOR</span>
        </div>
        <LayoutSelector value={layout} onChange={handleLayoutChange} />
        <button
          type="button"
          className={`topbar-sound${soundEnabled ? ' is-active' : ''}`}
          onClick={handleToggleSound}
          title={soundEnabled ? 'Matikan suara' : 'Nyalakan suara'}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? <SpeakerIcon muted={false} /> : <SpeakerIcon muted />}
          <span>{soundEnabled ? 'Suara' : 'Bisu'}</span>
        </button>
        <button type="button" className="topbar-settings" onClick={onOpenSettings}>
          ⚙ Settings
        </button>
      </header>

      <div className="monitor-body">
        <CameraList cameras={cameras} assignedCameraIds={assignedCameraIds} onToggleCamera={handleToggleCamera} />
        <main className="monitor-main">
          <CameraGrid layout={gridLayout} cameras={cameras} soundEnabled={soundEnabled} onSelectCamera={handleSelectCamera} />
        </main>
      </div>

      <footer className="statusbar">
        <span className="statusbar-item">
          <span className="status-dot status-dot-online" /> Online: {summary.online}/{summary.total}
        </span>
        {summary.reconnecting > 0 && (
          <span className="statusbar-item">
            <span className="status-dot status-dot-reconnecting" /> Reconnecting: {summary.reconnecting}
          </span>
        )}
        {summary.offline > 0 && (
          <span className="statusbar-item">
            <span className="status-dot status-dot-offline" /> Offline: {summary.offline}
          </span>
        )}
      </footer>
    </div>
  )
}
