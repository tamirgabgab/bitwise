import { describe, expect, it } from 'vitest'
import { placementParams } from './placement.ts'

describe('placementParams', () => {
  it('gives a choosing part one way for every value of the radix', () => {
    expect(placementParams('mux', 2)).toEqual({ inputs: 2 })
    expect(placementParams('mux', 3)).toEqual({ inputs: 3 })
    expect(placementParams('demux', 5)).toEqual({ outputs: 5 })
    expect(placementParams('decoder', 16)).toEqual({ outputs: 16 })
  })

  it('leaves every other part to its defaults', () => {
    expect(placementParams('and', 3)).toBeUndefined()
    expect(placementParams('adder', 3)).toBeUndefined()
  })
})
