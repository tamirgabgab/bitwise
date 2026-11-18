/*
 * Versions of a project: copies of its text the user saved by hand, or the
 * app kept on its own (each time the project was opened, and before going
 * back to an older version). They live in the browser next to the project,
 * under a key of their own, and never in the project file. Storage can be
 * missing or full, so nothing here ever throws.
 */

/** A project keeps at most this many versions; the oldest automatic ones go first. */
export const MAX_VERSIONS = 30

/** A version's name is at most this long. */
export const MAX_VERSION_NAME = 60

export interface Version {
  readonly id: string
  readonly name: string
  /** When it was kept, in milliseconds since 1970. */
  readonly saved: number
  /** True when the app kept it on its own rather than the user. */
  readonly auto: boolean
  /** The project as the text of a project file. */
  readonly text: string
}

/** Where the versions of project `id` are kept. */
export function versionsKey(id: string): string {
  return `cedar-logic.versions.${id}`
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

function parse(text: string | null): Version[] {
  if (text === null) return []
  try {
    const data = JSON.parse(text) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (item: Record<string, unknown>): item is Version & Record<string, unknown> =>
        typeof item?.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.saved === 'number' &&
        typeof item.auto === 'boolean' &&
        typeof item.text === 'string',
    )
  } catch {
    return []
  }
}

/** The versions of a project, the latest first. */
export function listVersions(project: string): Version[] {
  try {
    return parse(storage()?.getItem(versionsKey(project)) ?? null).sort((a, b) => b.saved - a.saved)
  } catch {
    return []
  }
}

/** The text of one version, or null if there is no such version. */
export function readVersion(project: string, id: string): string | null {
  return listVersions(project).find((version) => version.id === id)?.text ?? null
}

/** `versions` (latest first) without its oldest automatic one, or its oldest one when none is automatic. */
function withoutOldest(versions: readonly Version[]): Version[] {
  const autos = versions.filter((version) => version.auto)
  const drop = autos.length > 0 ? autos[autos.length - 1] : versions[versions.length - 1]
  return versions.filter((version) => version !== drop)
}

/**
 * Writes the versions, making room when storage is full by dropping the
 * oldest. False if even one version does not fit.
 */
function write(store: Storage, project: string, versions: Version[]): boolean {
  let kept = versions
  for (;;) {
    try {
      store.setItem(versionsKey(project), JSON.stringify(kept))
      return true
    } catch {
      if (kept.length <= 1) return false
      kept = withoutOldest(kept)
    }
  }
}

/**
 * Keeps `text` as a new version of project `project`. An automatic version
 * with the same text as the latest one is not added: that one is returned.
 * One the user asks for is always added. Returns null if storage is not
 * working.
 */
export function addVersion(
  project: string,
  text: string,
  name: string,
  auto: boolean,
): Version | null {
  const store = storage()
  if (!store) return null
  const versions = listVersions(project)
  if (auto && versions[0]?.text === text) return versions[0]
  const saved = Math.max(Date.now(), (versions[0]?.saved ?? 0) + 1)
  const version: Version = {
    id: `v${saved.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, MAX_VERSION_NAME) || 'Version',
    saved,
    auto,
    text,
  }
  let next = [version, ...versions]
  while (next.length > MAX_VERSIONS) next = withoutOldest(next)
  return write(store, project, next) ? version : null
}

/** Removes one version. False if storage is not working. */
export function deleteVersion(project: string, id: string): boolean {
  const store = storage()
  if (!store) return false
  const versions = listVersions(project).filter((version) => version.id !== id)
  try {
    if (versions.length === 0) store.removeItem(versionsKey(project))
    else store.setItem(versionsKey(project), JSON.stringify(versions))
    return true
  } catch {
    return false
  }
}
