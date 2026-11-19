import type { Dictionary } from '../index.ts'
import { chrome } from './chrome.ts'
import { common } from './common.ts'
import { editor } from './editor.ts'
import { hdl } from './hdl.ts'
import { panels } from './panels.ts'
import { parts } from './parts.ts'

/** Each dictionary of the Hebrew interface by its name, for the test that checks them. */
export const HEBREW_PARTS: Readonly<Record<string, Dictionary>> = { common, chrome, parts, panels, editor, hdl }

/** Every Hebrew message. Loaded only when the interface speaks Hebrew. */
export const hebrew: Dictionary = Object.assign({}, ...Object.values(HEBREW_PARTS))
