import { describe, expect, it } from 'vitest'
import { MAX_FILE_LENGTH, ProjectFileError } from './projectFile.ts'
import { MAX_LINK_LENGTH, readShareFragment, shareFragment, unpackShared } from './shareLink.ts'

async function pack(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const packed = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (const byte of packed) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('share links', () => {
  it('carries a text and a name there and back', async () => {
    const text = JSON.stringify({ format: 'cedar-logic', note: 'שלום ✓', items: Array(200).fill('and') })
    const fragment = await shareFragment(text, 'My adder')
    expect(fragment.length).toBeLessThan(text.length)
    const shared = readShareFragment(`#${fragment}`)
    expect(shared?.name).toBe('My adder')
    expect(await unpackShared(shared!.data)).toBe(text)
  })

  it('is not a share link without the data', () => {
    expect(readShareFragment('')).toBeNull()
    expect(readShareFragment('#section')).toBeNull()
    expect(readShareFragment('#n=x')).toBeNull()
  })

  it('cleans the name and cuts it', () => {
    const shared = readShareFragment(`n=${encodeURIComponent(' a\u0000b ' + 'c'.repeat(100))}&p=AA`)
    expect(shared?.name.startsWith('ab')).toBe(true)
    expect(shared?.name.length).toBe(60)
  })

  it('refuses a fragment longer than any project', () => {
    expect(() => readShareFragment('p=' + 'A'.repeat(MAX_LINK_LENGTH))).toThrow(ProjectFileError)
  })

  it('refuses damaged data with a reason', async () => {
    await expect(unpackShared('not base64!')).rejects.toThrow(ProjectFileError)
    await expect(unpackShared('AAAA')).rejects.toThrow(/damaged/)
    const good = (await shareFragment('{"a":1}', 'x')).split('p=')[1]
    await expect(unpackShared(good.slice(0, -3))).rejects.toThrow(ProjectFileError)
  })

  it('stops unpacking a small link that would grow past the limit of a file', async () => {
    const bomb = await pack(new Uint8Array(MAX_FILE_LENGTH + 1000).fill(32))
    expect(bomb.length).toBeLessThan(20_000)
    await expect(unpackShared(bomb)).rejects.toThrow(/more than a project can be/)
  })

  it('refuses bytes that are not text', async () => {
    await expect(unpackShared(await pack(new Uint8Array([0xff, 0xfe, 0xfd])))).rejects.toThrow(/text/)
  })
})
