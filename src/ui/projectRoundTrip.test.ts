import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../editor/index.ts'
import { DEFAULT_SETTINGS, fromProjectData, toProjectData } from '../editor/project.ts'
import { parseProject, serializeProject } from '../io/index.ts'

/*
 * The editor and the file format describe the same shapes without importing
 * each other. This is where they meet, so this is where they are held together.
 */

describe('a project through the file format', () => {
  it('reads every example back as it was written', () => {
    for (const example of EXAMPLES) {
      const data = example.build()
      const text = serializeProject(data)
      expect(parseProject(text)).toEqual(data)
      const loaded = fromProjectData(parseProject(text))
      expect(toProjectData(loaded)).toEqual(toProjectData(fromProjectData(data)))
    }
  })

  it('gives a file without colors the colors a new project starts with', () => {
    const data = EXAMPLES[0].build()
    const text = serializeProject({ ...data, settings: { ...data.settings, palette: [] } })
    expect(parseProject(text).settings.palette).toEqual(DEFAULT_SETTINGS.palette)
  })
})
