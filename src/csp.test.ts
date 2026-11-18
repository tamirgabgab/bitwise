import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY } from './csp.ts'

/** The sources one directive of the policy allows. */
function sources(directive: string): string[] {
  const entry = CONTENT_SECURITY_POLICY.split('; ').find((part) => part.startsWith(`${directive} `))
  return entry ? entry.split(' ').slice(1) : []
}

describe('the content security policy', () => {
  it('runs only the scripts of the site itself', () => {
    expect(sources('script-src')).toEqual(["'self'"])
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|\*/)
  })

  it('loads nothing from another site', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/)
    expect(sources('default-src')).toEqual(["'self'"])
  })

  it('shuts plugins, a moved base and forms', () => {
    expect(sources('object-src')).toEqual(["'none'"])
    expect(sources('base-uri')).toEqual(["'none'"])
    expect(sources('form-action')).toEqual(["'none'"])
  })

  it('lets the thumbnails show as data URLs', () => {
    expect(sources('img-src')).toContain('data:')
  })
})
