import { describe, test, expect } from 'vitest'
import {
  encryptText,
  decryptText,
  generateEncryptionKey,
  exportKey,
  importKey,
  bufToBase64url,
  base64urlToBuf
} from '../src/lib/crypto'

describe('crypto helpers', () => {
  test('round-trip: encrypt then decrypt returns original text', async () => {
    const key = await generateEncryptionKey()
    const original = 'Hello, this is a secret message!'
    const encrypted = await encryptText(key, original)
    const decrypted = await decryptText(key, encrypted)
    expect(decrypted).toBe(original)
  })

  test('each encryption produces a different IV', async () => {
    const key = await generateEncryptionKey()
    const a = await encryptText(key, 'same text')
    const b = await encryptText(key, 'same text')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  test('tamper detection: modified ciphertext throws', async () => {
    const key = await generateEncryptionKey()
    const encrypted = await encryptText(key, 'secret')
    // Flip a character in the ciphertext
    const tampered = { ...encrypted, ct: encrypted.ct.slice(0, -2) + 'aa' }
    await expect(decryptText(key, tampered)).rejects.toThrow('Decryption failed')
  })

  test('wrong key throws', async () => {
    const key1 = await generateEncryptionKey()
    const key2 = await generateEncryptionKey()
    const encrypted = await encryptText(key1, 'secret')
    await expect(decryptText(key2, encrypted)).rejects.toThrow()
  })

  test('key export and import round-trip', async () => {
    const key = await generateEncryptionKey()
    const exported = await exportKey(key)
    const imported = await importKey(exported)
    // Verify they produce same results
    const enc = await encryptText(key, 'test')
    const dec = await decryptText(imported, enc)
    expect(dec).toBe('test')
  })

  test('bufToBase64url and base64urlToBuf are inverses', () => {
    const original = new Uint8Array([1, 2, 3, 4, 255, 0, 128])
    const encoded = bufToBase64url(original)
    const decoded = base64urlToBuf(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(original))
  })

  test('base64url has no padding characters', async () => {
    const key = await generateEncryptionKey()
    const exported = await exportKey(key)
    expect(exported).not.toContain('=')
    expect(exported).not.toContain('+')
    expect(exported).not.toContain('/')
  })

  test('encrypts empty string', async () => {
    const key = await generateEncryptionKey()
    const enc = await encryptText(key, '')
    const dec = await decryptText(key, enc)
    expect(dec).toBe('')
  })

  test('encrypts unicode content', async () => {
    const key = await generateEncryptionKey()
    const text = '🔐 Hello 世界 \n\t special chars: <>&'
    const enc = await encryptText(key, text)
    const dec = await decryptText(key, enc)
    expect(dec).toBe(text)
  })
})
