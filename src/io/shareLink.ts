import { MAX_FILE_LENGTH, ProjectFileError } from './projectFile.ts'

/*
 * A project carried in the address itself, so a circuit can be sent as a
 * link instead of a file. The fragment (after #) never reaches the server:
 * it reads `n=<name>&p=<data>`, where the data is the text of the project
 * file, compressed with raw deflate and written in base64url.
 *
 * A link can come from anyone, like a file. The data is unpacked a piece at
 * a time and given up once it passes `MAX_FILE_LENGTH`, so a small link that
 * unpacks to something huge cannot hang the page; the text then goes through
 * `parseProject` with all the limits of a file.
 */

/** The key of the project's data in the fragment. */
const DATA_KEY = 'p'
/** The key of the project's name in the fragment. */
const NAME_KEY = 'n'
/** The longest name a link gives its project; the list cuts names there too. */
const MAX_LINK_NAME = 60
/** The longest fragment read: base64 of the most a project can be, uncompressed. */
export const MAX_LINK_LENGTH = Math.ceil((MAX_FILE_LENGTH * 4) / 3) + 64
/**
 * Past this many characters some apps cut a link when it is pasted, so the
 * user is told the link is long.
 */
export const LONG_LINK = 8000

/** What a share link carries, still packed. */
export interface SharedProject {
  readonly name: string
  readonly data: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  // In pieces, since an argument list has a limit.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ProjectFileError('The link is damaged: it has characters a link never has.')
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new ProjectFileError('The link is damaged: it was cut or changed.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function readAll(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > limit) {
      await reader.cancel()
      throw new ProjectFileError(`The link holds more than ${limit / 1_000_000} MB, more than a project can be.`)
    }
    chunks.push(value)
  }
  const all = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    all.set(chunk, at)
    at += chunk.length
  }
  return all
}

/** The fragment, without its #, of a link that carries `text` under `name`. */
export async function shareFragment(text: string, name: string): Promise<string> {
  const packed = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const data = toBase64Url(await readAll(packed, Number.POSITIVE_INFINITY))
  const params = new URLSearchParams()
  params.set(NAME_KEY, name.slice(0, MAX_LINK_NAME))
  params.set(DATA_KEY, data)
  return params.toString()
}

/** What a fragment (with or without its #) carries, or null when it is not a share link. */
export function readShareFragment(fragment: string): SharedProject | null {
  const text = fragment.startsWith('#') ? fragment.slice(1) : fragment
  if (text.length > MAX_LINK_LENGTH) {
    throw new ProjectFileError(`The link is longer than a project can be.`)
  }
  const params = new URLSearchParams(text)
  const data = params.get(DATA_KEY)
  if (data === null) return null
  const name = (params.get(NAME_KEY) ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, MAX_LINK_NAME)
  return { name, data }
}

/** The text of the project file a link's data packs. Throws a `ProjectFileError` when it cannot. */
export async function unpackShared(data: string): Promise<string> {
  const bytes = fromBase64Url(data)
  const unpacked = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  let raw: Uint8Array
  try {
    raw = await readAll(unpacked, MAX_FILE_LENGTH)
  } catch (error) {
    if (error instanceof ProjectFileError) throw error
    throw new ProjectFileError('The link is damaged: it was cut or changed.')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(raw)
  } catch {
    throw new ProjectFileError('The link is damaged: it does not hold text.')
  }
}
