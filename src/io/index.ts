/**
 * Persistence: the project file format, the copy kept in the browser, and
 * files on the user's computer. Depends on src/core only.
 */

export {
  FILE_FORMAT,
  FILE_FORMAT_VERSION,
  MAX_CIRCUITS,
  MAX_COORD,
  MAX_FILE_DELAY,
  MAX_FILE_LENGTH,
  MAX_FLAT_PARTS,
  MAX_ID_NUMBER,
  MAX_ITEMS,
  MAX_PIN_NAME,
  MAX_STATE_NAME,
  MACHINE_SPACE,
  ProjectFileError,
  isSafeId,
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
export { downloadText, fileHooks, pickTextFile, safeFileName } from './files.ts'
export { LONG_LINK, readShareFragment, shareFragment, unpackShared } from './shareLink.ts'
export type { SharedProject } from './shareLink.ts'
export type { PickedFile } from './files.ts'
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
