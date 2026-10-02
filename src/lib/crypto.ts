/**
 * src/lib/crypto.ts
 * Phase 5: AES-GCM 256-bit end-to-end encryption helpers.
 * Key lives ONLY in the URL fragment (#k=...) – never sent to server.
 * Uses WebCrypto API (browser-native, no dependencies).
 */

const ALGO = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

// ─── Key generation & serialization ──────────────────────────────

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return bufToBase64url(new Uint8Array(raw))
}

export async function importKey(b64url: string): Promise<CryptoKey> {
  const raw = base64urlToBuf(b64url)
  return crypto.subtle.importKey('raw', raw as any, { name: ALGO }, true, ['encrypt', 'decrypt'])
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────

export interface EncryptedPayload {
  iv: string      // base64url
  ct: string      // base64url ciphertext
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv: iv as any }, key, encoded as any)
  return {
    iv: bufToBase64url(iv),
    ct: bufToBase64url(new Uint8Array(ciphertext))
  }
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = base64urlToBuf(payload.iv)
  const ct = base64urlToBuf(payload.ct)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt({ name: ALGO, iv: iv as any }, key, ct as any)
  } catch {
    throw new Error('Decryption failed – wrong key or tampered data')
  }
  return new TextDecoder().decode(plaintext)
}

// ─── Base64url helpers ───────────────────────────────────────────

export function bufToBase64url(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlToBuf(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}

// ─── Fragment key helpers ─────────────────────────────────────────

export function getKeyFromFragment(): string | null {
  if (typeof window === 'undefined') return null
  const fragment = window.location.hash
  const match = fragment.match(/[#&]k=([^&]+)/)
  return match ? match[1] : null
}

export function buildRoomUrlWithKey(roomId: string, keyB64url: string, base?: string): string {
  const origin = base || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${origin}/room/${roomId}#k=${keyB64url}`
}
