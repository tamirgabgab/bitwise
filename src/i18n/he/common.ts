import type { Dictionary } from '../index.ts'

/**
 * Hebrew for words many files share. A message here is not repeated in the
 * dictionary of a group; the test of the dictionaries refuses a key in two
 * of them.
 */
export const common: Dictionary = {
  Cancel: 'ביטול',
  Close: 'סגירה',
  Delete: 'מחיקה',
  Rename: 'שינוי שם',
  Undo: 'ביטול פעולה',
  Redo: 'ביצוע חוזר',
  Paste: 'הדבקה',
  Rotate: 'סיבוב',
  Run: 'הפעלה',
  Pause: 'עצירה',
  Help: 'עזרה',
  Search: 'חיפוש',
  Name: 'שם',
  Value: 'ערך',
  Delay: 'השהיה',
  Inputs: 'כניסות',
  Outputs: 'יציאות',
  Input: 'כניסה',
  Output: 'יציאה',
  Radix: 'בסיס',
  Language: 'שפה',
}
