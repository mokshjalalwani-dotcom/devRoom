import { describe, test, expect } from 'vitest'
import { scanForSecrets } from '../src/lib/secrets'

describe('scanForSecrets', () => {
  test('finds AWS keys', () => {
    const res = scanForSecrets('my key is AKIA1234567890ABCDEF here')
    expect(res).toHaveLength(1)
    expect(res[0].name).toBe('AWS Access Key')
  })

  test('finds multiple secrets', () => {
    const res = scanForSecrets('AKIA1234567890ABCDEF and ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789')
    expect(res).toHaveLength(2)
  })

  test('returns empty for safe text', () => {
    expect(scanForSecrets('just some text')).toHaveLength(0)
  })
})
