import { useEffect, useState } from 'react'
import { Monitor } from '@/pages/Monitor'
import { Settings } from '@/pages/Settings'
import { applyConfiguredStreams } from '@/services/go2rtcConfigService'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void applyConfiguredStreams()
  }, [])

  return (
    <div className="app">
      {showSettings ? <Settings onClose={() => setShowSettings(false)} /> : <Monitor onOpenSettings={() => setShowSettings(true)} />}
    </div>
  )
}
