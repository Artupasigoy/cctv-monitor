import type { Camera, CameraStatus } from '@/types/camera'
import { rtspUrl } from './configService'

export const GO2RTC_STREAM_PREFIX = 'cam'

export function go2rtcStreamName(cameraId: string): string {
  return `${GO2RTC_STREAM_PREFIX}_${cameraId}`
}

export interface StreamCallbacks {
  onStatusChange: (status: CameraStatus, message?: string) => void
  onTrack?: (stream: MediaStream) => void
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 15000, 30000]
/** Setelah N percobaan gagal, jeda menjadi lambat agar tidak membebani
 * jaringan/kamera/CCTV secara terus-menerus (camera offline permanen). */
const MAX_RECONNECT_ATTEMPTS = 20
const SLOW_RETRY_DELAY_MS = 5 * 60 * 1000
const CONNECTION_TIMEOUT_MS = 15000

export class StreamConnection {
  private wsUrl: string
  private callbacks: StreamCallbacks
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private active = false
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private connectTimeoutTimer: number | null = null
  private pendingIce: RTCIceCandidateInit[] = []
  private remoteReady = false

  constructor(camera: Camera, apiHost: string, apiPort: number, callbacks: StreamCallbacks) {
    this.wsUrl = `ws://${apiHost}:${apiPort}/api/ws?src=${go2rtcStreamName(camera.id)}`
    this.callbacks = callbacks
  }

  start(): void {
    if (this.active) return
    this.active = true
    this.connect()
  }

  stop(): void {
    this.active = false
    this.clearReconnectTimer()
    this.clearConnectTimeout()
    this.closeWebRTC()
    this.closeWs()
  }

  /** Retry manual (tombol "Coba Lagi"): mulai ulang koneksi sekarang. */
  retryNow(): void {
    if (!this.active) return
    this.reconnectAttempt = 0
    this.clearReconnectTimer()
    this.clearConnectTimeout()
    this.closeWebRTC()
    this.closeWs()
    this.connect()
  }

  /** Reset ulang koneksi dengan backoff (dipakai stall detector). */
  reconnectWithBackoff(message: string): void {
    if (!this.active) return
    this.callbacks.onStatusChange('reconnecting', message)
    this.handleFailure(message)
  }

  private connect(): void {
    if (!this.active) return
    console.log(`[stream] ${this.wsUrl} connect attempt=${this.reconnectAttempt}`)
    this.callbacks.onStatusChange(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
      this.reconnectAttempt > 0 ? 'Mencoba menghubungkan kembali...' : undefined,
    )

    try {
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:127.0.0.1:0' }],
      })
    } catch {
      this.pc = new RTCPeerConnection()
    }

    this.pc.addTransceiver('video', { direction: 'recvonly' })
    this.pc.addTransceiver('audio', { direction: 'recvonly' })
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sendCandidate(e.candidate)
    }
    this.pc.ontrack = (e) => {
      this.callbacks.onTrack?.(e.streams[0] ?? new MediaStream([e.track]))
    }

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[stream] ${this.wsUrl} ice state=${this.pc?.iceConnectionState}`)
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log(`[stream] ${this.wsUrl} pc state=${state}`)
      if (state === 'connected') {
        this.clearConnectTimeout()
        this.reconnectAttempt = 0
        this.callbacks.onStatusChange('online')
      } else if (state === 'failed' || state === 'disconnected') {
        this.handleFailure('Koneksi terputus')
      }
    }

    this.openWs()
  }

  private openWs(): void {
    try {
      this.ws = new WebSocket(this.wsUrl)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log(`[stream] ${this.wsUrl} ws open, send offer`)
      this.sendOffer()
      this.startConnectTimeout()
    }
    this.ws.onmessage = (e) => this.handleMessage(e.data)
    this.ws.onerror = () => this.handleFailure('WebSocket error')
    this.ws.onclose = () => {
      if (this.active && this.pc?.connectionState !== 'connected') {
        this.handleFailure('Koneksi terputus')
      }
    }
  }

  private sendOffer(): void {
    if (!this.pc) return
    this.pc
      .createOffer()
      .then((offer) => this.pc!.setLocalDescription(offer))
      .then(() => {
        if (!this.pc?.localDescription) return
        this.send({
          type: 'webrtc/offer',
          value: this.pc.localDescription.sdp,
        })
      })
      .catch(() => this.handleFailure('Gagal membuat offer'))
  }

  private handleMessage(data: unknown): void {
    let msg: { type?: string; value?: string }
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    console.log(`[stream] ${this.wsUrl} msg type=${msg.type}`)
    if (!msg.type) return

    if (msg.type === 'error') {
      this.handleFailure(msg.value || 'Stream tidak tersedia')
    } else if (msg.type === 'webrtc/answer') {
      if (!msg.value || !this.pc) {
        console.log(`[stream] ${this.wsUrl} answer ignored: pc=${Boolean(this.pc)}`)
        return
      }
      this.pc
        .setRemoteDescription({ type: 'answer', sdp: msg.value })
        .then(() => {
          console.log(`[stream] ${this.wsUrl} remote desc set`)
          const candLines = msg.value!.split('\n').filter((l) => l.startsWith('a=candidate'))
          console.log(`[stream] ${this.wsUrl} answer candidates: ${candLines.length} :: ${candLines.join('|').slice(0, 200)}`)
          this.remoteReady = true
          this.flushPendingIce()
        })
        .catch(() => this.handleFailure('Gagal menerima answer'))
    } else if (msg.type === 'webrtc/candidate' && msg.value) {
      console.log(`[stream] ${this.wsUrl} candidate raw=${String(msg.value).slice(0, 120)}`)
      this.addCandidate(msg.value)
    }
  }

  private addCandidate(candidateInit: string | RTCIceCandidateInit): void {
    if (!this.pc) return
    const candidate: RTCIceCandidateInit =
      typeof candidateInit === 'string' ? { candidate: candidateInit, sdpMid: '0' } : candidateInit
    if (!this.remoteReady) {
      this.pendingIce.push(candidate)
      return
    }
    this.pc
      .addIceCandidate(candidate)
      .then(() => console.log(`[stream] ${this.wsUrl} added remote candidate`))
      .catch((e) => {
        console.log(`[stream] ${this.wsUrl} addIceCandidate failed: ${String(e)}`)
      })
  }

  private flushPendingIce(): void {
    console.log(`[stream] ${this.wsUrl} flush pending ice count=${this.pendingIce.length}`)
    const pending = this.pendingIce
    this.pendingIce = []
    for (const c of pending) this.addCandidate(c)
  }

  private sendCandidate(candidate: RTCIceCandidate): void {
    const msg = { type: 'webrtc/candidate', value: candidate.candidate }
    console.log(`[stream] ${this.wsUrl} send local candidate=${String(candidate.candidate).slice(0, 80)}`)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(msg)
    } else {
      this.pendingIce.push(candidate.toJSON())
    }
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  private startConnectTimeout(): void {
    this.clearConnectTimeout()
    this.connectTimeoutTimer = window.setTimeout(() => {
      this.connectTimeoutTimer = null
      if (!this.active || this.pc?.connectionState === 'connected') return
      console.log(`[stream] ${this.wsUrl} connect timeout, forcing reconnect`)
      this.handleFailure('Koneksi timeout')
    }, CONNECTION_TIMEOUT_MS)
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer !== null) {
      window.clearTimeout(this.connectTimeoutTimer)
      this.connectTimeoutTimer = null
    }
  }

  private handleFailure(message: string): void {
    console.log(`[stream] ${this.wsUrl} failure: ${message}`)
    this.closeWebRTC()
    this.closeWs()
    if (!this.active) return
    this.scheduleReconnect(message)
  }

  private scheduleReconnect(message?: string): void {
    if (!this.active || this.reconnectTimer !== null) return
    this.reconnectAttempt++
    let delay: number
    let status: 'reconnecting' | 'offline' = 'reconnecting'
    let msg = message ?? 'Koneksi terputus'

    if (this.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      // Kamera lama offline: hentikan upaya agresif, retry lambat agar tidak
      // membebani jaringan/device secara terus-menerus.
      delay = SLOW_RETRY_DELAY_MS
      status = 'offline'
      msg = 'Kamera tidak merespons. Akan dicoba otomatis setiap 5 menit — atau klik "Coba Lagi".'
    } else {
      delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt - 1, RECONNECT_DELAYS.length - 1)]
    }
    this.callbacks.onStatusChange(status, msg)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private closeWebRTC(): void {
    if (this.pc) {
      this.pc.ontrack = null
      this.pc.onicecandidate = null
      this.pc.onconnectionstatechange = null
      this.pc.close()
      this.pc = null
    }
    this.pendingIce = []
    this.remoteReady = false
  }

  private closeWs(): void {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}

export function isCameraConfigured(camera: Camera): boolean {
  return Boolean(camera.host && camera.rtspPath && (camera.username || camera.passwordEnc || camera.password))
}

export async function getRtspUrl(camera: Camera): Promise<string | null> {
  return rtspUrl(camera)
}
