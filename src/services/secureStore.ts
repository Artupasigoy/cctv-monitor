import type { EncryptedText } from '@/types/camera'

const DB_NAME = 'cctv-monitor'
const DB_VERSION = 1
const STORE_NAME = 'keys'
const KEY_ID = 'camera-passwords-key'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb()
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(KEY_ID)
      req.onsuccess = () => resolve(req.result as CryptoKey | undefined)
      req.onerror = () => reject(req.error)
    })
    if (existing) return existing

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(key, KEY_ID)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return key
  } finally {
    db.close()
  }
}

export async function encryptText(plaintext: string): Promise<EncryptedText> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) }
}

export async function decryptText(payload: EncryptedText): Promise<string> {
  const key = await getOrCreateKey()
  const iv = fromBase64(payload.iv)
  const data = fromBase64(payload.data)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    toArrayBuffer(data) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}
