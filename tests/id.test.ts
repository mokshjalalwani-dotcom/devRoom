import { test, expect } from 'vitest'
import { generateRoomId } from '../src/lib/id'

test('generates 16 char id', () => {
  const id = generateRoomId()
  expect(id).toHaveLength(16)
})

test('ids are random', () => {
  expect(generateRoomId()).not.toBe(generateRoomId())
})
