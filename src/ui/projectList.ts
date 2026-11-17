import type { StoredProject } from '../io/index.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** When a project was last saved, as a person would say it: "5 minutes ago". */
export function savedWhen(saved: number, now: number): string {
  const ago = Math.max(0, now - saved)
  if (ago < MINUTE) return 'just now'
  const say = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`
  if (ago < HOUR) return say(Math.floor(ago / MINUTE), 'minute')
  if (ago < DAY) return say(Math.floor(ago / HOUR), 'hour')
  if (ago < 7 * DAY) return say(Math.floor(ago / DAY), 'day')
  return `on ${new Date(saved).toLocaleDateString()}`
}

/** The projects, the one saved last first. */
export function latestFirst(projects: readonly StoredProject[]): StoredProject[] {
  return [...projects].sort((a, b) => b.saved - a.saved)
}
