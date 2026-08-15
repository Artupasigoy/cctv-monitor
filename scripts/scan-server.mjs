#!/usr/bin/env node
// Scan server — deteksi kamera di LAN untuk CCTV Monitor.
// Browser tidak bisa melakukan TCP scan, jadi endpoint HTTP ini berjalan di host.
// Dev: dijalankan manual (node scripts/scan-server.mjs).
// Produksi: launcher Go menyediakan endpoint /scan yang sama (lihat scanService.ts).
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'

const LISTEN_PORT = Number(process.env.SCAN_PORT || 1986)
const PORTS = [554, 8000]
const TIMEOUT_MS = 400
const CONCURRENCY = 100

function ipv4Interfaces() {
  const out = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address })
    }
  }
  return out
}

function isPrivate(ip) {
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function hostOctets(ip) {
  return ip.split('.').slice(0, 3).join('.')
}

function autoRanges() {
  const seen = new Set()
  const ranges = []
  for (const iface of ipv4Interfaces()) {
    if (!isPrivate(iface.address)) continue
    const r = `${hostOctets(iface.address)}.0/24`
    if (!seen.has(r)) {
      seen.add(r)
      ranges.push(r)
    }
  }
  return ranges
}

function parseRange(spec) {
  spec = spec.trim()
  const cidr = spec.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/)
  if (cidr) {
    const [a, b, c, d] = cidr[1].split('.').map(Number)
    const prefix = Number(cidr[2])
    if (prefix < 16 || prefix > 30) return null
    const hostBits = 32 - prefix
    const base = ((((a << 8 | b) << 8 | c) << 8) | d) >>> 0
    const net = (base >>> hostBits) << hostBits
    const ips = []
    for (let i = 1; i < 2 ** hostBits - 1; i++) ips.push(intToIp((net + i) >>> 0))
    return ips
  }
  const dash = spec.match(/^(\d+\.\d+\.\d+)\.(\d+)-(\d+)$/)
  if (dash) {
    const [prefix, lo, hi] = [dash[1], Number(dash[2]), Number(dash[3])]
    const ips = []
    for (let i = Math.max(1, lo); i <= Math.min(254, hi); i++) ips.push(`${prefix}.${i}`)
    return ips
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(spec)) return [spec]
  return null
}

function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

function checkPort(ip, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      sock.destroy()
      resolve(ok)
    }
    sock.setTimeout(TIMEOUT_MS)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
    sock.connect(port, ip)
  })
}

async function scanOne(ip) {
  const open = []
  for (const p of PORTS) if (await checkPort(ip, p)) open.push(p)
  return open
}

async function scanAll(ips) {
  const found = []
  let idx = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < ips.length) {
      const ip = ips[idx++]
      const open = await scanOne(ip)
      if (open.length) found.push({ host: ip, ports: open })
    }
  })
  await Promise.all(workers)
  found.sort((x, y) => x.host.localeCompare(y.host, 'en', { numeric: true }))
  return found
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/health') {
    json(res, 200, { ok: true })
    return
  }

  if (url.pathname === '/scan') {
    const rangeSpec = url.searchParams.get('range') || ''
    const ranges = rangeSpec ? rangeSpec.split(',').filter(Boolean) : autoRanges()
    const ips = []
    const seen = new Set()
    let bad = false
    for (const r of ranges) {
      const list = parseRange(r)
      if (!list) {
        bad = true
        continue
      }
      for (const ip of list) if (!seen.has(ip)) {
        seen.add(ip)
        ips.push(ip)
      }
    }
    if (bad) {
      json(res, 400, { error: `Rentang tidak valid: ${ranges.join(', ')}` })
      return
    }
    const t0 = Date.now()
    scanAll(ips)
      .then((found) => {
        json(res, 200, { found, scanned: ips.length, ms: Date.now() - t0 })
      })
      .catch((e) => json(res, 500, { error: String(e) }))
    return
  }

  json(res, 404, { error: 'not found' })
})

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[scan-server] listening on 0.0.0.0:${LISTEN_PORT}`)
  console.log(`[scan-server] auto-detect ranges: ${autoRanges().join(', ') || '(none)'}`)
})
