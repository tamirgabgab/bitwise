/**
 * Persistence: the project file format, the copy kept in the browser, and
 * files on the user's computer. Depends on src/core only.
 */

export {
  FILE_FORMAT,
  FILE_FORMAT_VERSION,
  ProjectFileError,
  parseProject,
  serializeProject,
} from './projectFile.ts'
export type {
  FileCircuit,
  FileComponent,
  FileJunction,
  FileSettings,
  FileTerminal,
  FileView,
  FileWire,
  ProjectFile,
} from './projectFile.ts'
export { downloadText, pickTextFile, safeFileName } from './files.ts'
export {
  MAX_PROJECT_NAME,
  chooseLocal,
  createLocal,
  deleteLocal,
  duplicateLocal,
  freshName,
  listLocal,
  loadLocal,
  readLocal,
  renameLocal,
  saveLocal,
  setAsideLocal,
  watchLocal,
} from './storage.ts'
export type { Library, StoredProject } from './storage.ts'
export {
  MAX_VERSION_NAME,
  addVersion,
  deleteVersion,
  listVersions,
  readVersion,
} from './versions.ts'
export type { Version } from './versions.ts'
