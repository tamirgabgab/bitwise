import { describe, expect, it } from 'vitest'
import { packWord, parseSignal } from '../core/index.ts'
import { addressText, typedWord, wordText, wordsFromText } from './memoryWords.ts'

const word = (text: string): number => packWord(parseSignal(text, 16))

describe('the words of a memory in the inspector', () => {
  it('write an address as wide as the address pin', () => {
    expect(addressText(5, 4, 2)).toBe('0101')
    expect(addressText(7, 2, 3)).toBe('21')
    expect(addressText(255, 2, 16)).toBe('FF')
  })

  it('write a word in the digits of the radix, and X for a digit it has no room for', () => {
    expect(wordText(word('1011'), 4, 2)).toBe('1011')
    expect(wordText(word('2'), 2, 2)).toBe('0X')
    expect(wordText(word('21'), 2, 3)).toBe('21')
  })

  it('read a typed word, filled with zeros in front', () => {
    expect(typedWord('11', 4, 2)).toBe(word('0011'))
    expect(typedWord(' 2A ', 2, 16)).toBe(word('2A'))
    expect(typedWord('2', 4, 2)).toBeUndefined()
    expect(typedWord('10101', 4, 2)).toBeUndefined()
    expect(typedWord('1X', 4, 2)).toBeUndefined()
    expect(typedWord('', 4, 2)).toBeUndefined()
  })

  it('read pasted words from address 0, or say what is wrong', () => {
    expect(wordsFromText('0001, 10\n11  0', 4, 2, 16)).toEqual([word('1'), word('10'), word('11'), 0])
    expect(wordsFromText('', 4, 2, 16)).toMatch(/at least one/)
    expect(wordsFromText('1 1 1', 1, 2, 2)).toMatch(/holds 2 words; the text has 3/)
    expect(wordsFromText('1 7', 4, 2, 16)).toMatch(/“7” is not a word of up to 4 digits from 0 to 1/)
  })
})
