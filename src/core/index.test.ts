import { describe, expect, it } from 'vitest'
import { CORE_VERSION } from './index.ts'

// Smoke test: proves the test runner is wired up. Real engine tests arrive
// with the simulation core in Phase 1.
describe('core', () => {
  it('exposes a semver version string', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
