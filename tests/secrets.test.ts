import { describe, test, expect } from 'vitest'
import { scanForSecrets } from '../src/lib/secrets'

describe('scanForSecrets', () => {
  test('detects AWS access key', () => {
    const result = scanForSecrets('key: AKIAIOSFODNN7EXAMPLE')
    expect(result.some(s => s.name === 'AWS Access Key')).toBe(true)
  })

  test('detects GitHub token', () => {
    const result = scanForSecrets('ghp_1234567890abcdef1234567890abcdef12345')
    expect(result.some(s => s.name === 'GitHub Token')).toBe(true)
  })

  test('detects Stripe test key', () => {
    const result = scanForSecrets('stripe_key_fake_abcdefghijklmnopqrstuvwx')
    expect(result.some(s => s.name === 'Stripe Key')).toBe(true)
  })

  test('detects private key header', () => {
    const result = scanForSecrets('-----BEGIN RSA PRIVATE KEY-----')
    expect(result.some(s => s.name === 'Private Key')).toBe(true)
  })

  test('detects database URL with password', () => {
    const result = scanForSecrets('postgresql://user:password@host:5432/db')
    expect(result.some(s => s.name === 'Database URL with Password')).toBe(true)
  })

  test('detects generic API key', () => {
    const result = scanForSecrets('api_key=supersecret_value_here_1234')
    expect(result.some(s => s.name === 'Generic Secret')).toBe(true)
  })

  test('returns empty array for clean text', () => {
    expect(scanForSecrets('hello world, nothing to see here')).toEqual([])
  })

  test('no duplicate names in results', () => {
    const text = 'AKIAIOSFODNN7EXAMPLE and also AKIAIOSFODNN7EXAMPLE2'
    const result = scanForSecrets(text)
    const names = result.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test('scans curl Authorization headers for secrets', () => {
    const curl = `curl -H 'Authorization: ghp_1234567890abcdef1234567890abcdef12345' https://api.example.com`
    // detect the curl type first
    const result = scanForSecrets(curl)
    expect(result.some(s => s.name === 'GitHub Token')).toBe(true)
  })
})
