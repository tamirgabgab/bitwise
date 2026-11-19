import { language, t } from '../i18n/index.ts'
import type { StoredProject } from '../io/index.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** When a project was last saved, as a person would say it: "5 minutes ago". */
export function savedWhen(saved: number, now: number): string {
  const ago = Math.max(0, now - saved)
  if (ago < MINUTE) return t('just now')
  if (ago < HOUR) {
    const count = Math.floor(ago / MINUTE)
    return count === 1 ? t('1 minute ago') : t('{count} minutes ago', { count })
  }
  if (ago < DAY) {
    const count = Math.floor(ago / HOUR)
    return count === 1 ? t('1 hour ago') : t('{count} hours ago', { count })
  }
  if (ago < 7 * DAY) {
    const count = Math.floor(ago / DAY)
    return count === 1 ? t('1 day ago') : t('{count} days ago', { count })
  }
  return t('on {date}', { date: new Date(saved).toLocaleDateString(dateLocale()) })
}

/** The locale dates are written in: Hebrew's, or the browser's own for English. */
function dateLocale(): string | undefined {
  return language() === 'he' ? 'he-IL' : undefined
}

/** The projects, the one saved last first. */
export function latestFirst(projects: readonly StoredProject[]): StoredProject[] {
  return [...projects].sort((a, b) => b.saved - a.saved)
}
