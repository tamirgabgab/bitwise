import { describe, expect, it } from 'vitest'
import { latestFirst, savedWhen } from './projectList.ts'

describe('savedWhen', () => {
  const now = Date.UTC(2026, 10, 17, 12)
  it('says how long ago, in the largest whole unit', () => {
    expect(savedWhen(now - 10_000, now)).toBe('just now')
    expect(savedWhen(now - 60_000, now)).toBe('1 minute ago')
    expect(savedWhen(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(savedWhen(now - 3 * 3_600_000, now)).toBe('3 hours ago')
    expect(savedWhen(now - 2 * 86_400_000, now)).toBe('2 days ago')
    expect(savedWhen(now - 30 * 86_400_000, now)).toMatch(/^on /)
  })

  it('reads a time in the future as now', () => {
    expect(savedWhen(now + 5000, now)).toBe('just now')
  })
})

describe('latestFirst', () => {
  it('puts the project saved last first', () => {
    const list = [
      { id: 'a', name: 'A', saved: 1 },
      { id: 'b', name: 'B', saved: 3 },
      { id: 'c', name: 'C', saved: 2 },
    ]
    expect(latestFirst(list).map((project) => project.id)).toEqual(['b', 'c', 'a'])
    expect(list[0].id).toBe('a')
  })
})
