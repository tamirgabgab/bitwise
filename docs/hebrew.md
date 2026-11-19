# The Hebrew interface

How the interface is translated, and the words it uses. The mechanism is
`src/i18n/index.ts`; the Hebrew messages are in `src/i18n/he/`.

## How a message is written

- The key is the English text. `t('Delete circuit')` gives the Hebrew, or
  the English when there is none.
- A value goes in as a place: `t('Delete “{name}”?', { name })`. Never
  `t(\`…${name}…\`)`, and never a sentence glued together from pieces: the
  word order of Hebrew differs. One message per sentence or label.
- A number that changes the noun picks its message in code:
  `count === 1 ? t('One part') : t('{count} parts', { count })`.
- Text kept in a constant and shown later is marked with `msg('…')` where it
  is written and shown with `t(text)`.
- Accessible names are text too: `aria-label`, `title`, `placeholder`, `alt`.
- The English must stay exactly as it was: tests check it.

What stays in English and is not wrapped: storage keys, ids, CSS classes,
the file format, the Verilog and VCD that are written out, console output,
keyboard key names (Ctrl, Shift, Esc), the app's name, gate names (AND, OR,
NOT, NAND, NOR, XOR, XNOR), the titles drawn on parts on the canvas, port
and pin names (clk, Q, en, cin), and the names of formats and standards
(SVG, VCD, PNG, JSON, Verilog, ALU, ROM, RAM).

## Hebrew style

- Buttons, menu items and commands are action nouns, never a gendered
  imperative: "מחיקת המעגל", "שמירה", "פתיחת קובץ", "הוספת מעגל".
- An explanation speaks in the impersonal plural present, the way a Hebrew
  manual does: "גוררים רכיב מהפלטה", "לוחצים פעמיים כדי לשנות שם".
- Short and plain. No "אנא", no exclamation marks. An error says what
  happened and what to do, and never blames the reader.
- Names in a message go between plain double quotes ("top"), not “ ”,
  which look reversed in right-to-left text.
- Technical English inside Hebrew stays as it is: "שער AND", "קובץ VCD".
- Numbers stay digits. Ranges read "בין 1 ל-99".
- The prefix letters join a Latin word or a number with a maqaf: "ב-Verilog",
  "ל-8 כניסות".

## Words

| English | Hebrew |
|---|---|
| circuit | מעגל |
| named circuit | מעגל בעל שם |
| part, component | רכיב |
| gate | שער |
| gate kit | ערכת שערים |
| sandbox | ארגז חול |
| wire | חוט |
| net | רשת |
| bus | באס |
| pin | פין |
| junction | צומת |
| input (part, a switch) | כניסה (מתג) |
| switch | מתג |
| button | כפתור |
| output | יציאה |
| number display | תצוגת מספר |
| clock | שעון |
| tick | טיק |
| radix | בסיס |
| digit | ספרה |
| value | ערך |
| unknown (X) | לא ידוע |
| floating (Z) | צף |
| conflict | התנגשות |
| mixed widths | רוחבים מעורבים |
| delay | השהיה |
| run / pause | הפעלה / עצירה |
| step (of the simulation) | צעד |
| step back | צעד אחורה |
| restart | התחלה מחדש |
| speed | מהירות |
| settles / never settles | מתייצב / לא מתייצב |
| flip-flop | פליפ-פלופ |
| latch | נועל (latch) |
| register | רגיסטר |
| counter | מונה |
| multiplexer | בורר |
| demultiplexer | מפזר |
| decoder | מפענח |
| adder / subtractor / multiplier | מחבר / מחסר / מכפל |
| comparator | משווה |
| shifter | מזיז |
| splitter / merger | מפצל / מאחד |
| constant | קבוע |
| table gate | שער טבלה |
| memory | זיכרון |
| word, address | מילה, כתובת |
| state machine | מכונת מצבים |
| state, rule, condition | מצב, כלל, תנאי |
| truth table | טבלת אמת |
| Karnaugh map | מפת קרנו |
| expression | ביטוי |
| timing diagram | דיאגרמת התזמון |
| watch (a wire) | מעקב |
| marker | סמן |
| meter board | לוח מדידות |
| probe | גשש |
| breakpoint | נקודת עצירה |
| critical path, longest path | המסלול הארוך ביותר |
| cone of influence | חרוט ההשפעה |
| palette | פלטה |
| inspector | חלונית המאפיינים |
| canvas | קנבס |
| selection, select | בחירה |
| frame | מסגרת |
| text label | תווית טקסט |
| net label | תווית רשת |
| project | פרויקט |
| version | גרסה |
| example | דוגמה |
| share link | קישור שיתוף |
| export / import | ייצוא / ייבוא |
| presentation, presentation steps | מצגת, צעדי מצגת |
| home screen | מסך הבית |
| tour | סיור |
| command search | חיפוש פקודות |
| quick add | הוספה מהירה |
| shortcut | קיצור מקשים |
| undo / redo | ביטול פעולה / ביצוע חוזר |
| edit history | היסטוריית העריכה |
| zoom | זום |
| theme (light, dark, system) | ערכת נושא (בהירה, כהה, לפי המערכת) |
| canvas look | מראה הקנבס |
| problem | בעיה |

## Groups

Each group has its own dictionary in `src/i18n/he/`, named after it, and
`common.ts` holds words many files share. A message is in one dictionary
only.

- **chrome:** the frame of the app in `src/ui`: `App`, `Toolbar`,
  `CircuitTabs`, `StatusBar`, `commands`, `shortcuts`, `ShortcutsSheet`,
  `CommandPalette`, `Keys`, `chrome`, `toasts`, `ToastHost`, `dialogs`,
  `DialogHost`, `presentation`, `LaserPointer`, `Tour`, `tour`,
  `CanvasView`, `Minimap`, `NameInput`, `useModal`, `panelSize`, `icons`,
  `language`.
- **parts:** parts and their properties: `src/ui/` `parts`, `Palette`,
  `paletteModel`, `Inspector`, `GateTable`, `TableEditor`, `MemoryEditor`,
  `memoryWords`, `TruthTablePanel`, `tableAnswers`, `MachineSummary`,
  `wholeNumber`, `probeText`, `ProbeBubble`, `placing`, `swatch`,
  `ValueLegend`; and `src/core`.
- **panels:** panels and windows in `src/ui`: `SettingsPanel`,
  `TimingPanel`, `StepsPanel`, `ProblemsPanel`, `MeterBoard`,
  `HomeScreen`, `Thumbnail`, `VersionsDialog`, `HistoryDialog`,
  `DescribeDialog`, `ExpressionDialog`, `VerilogDialog`, `BaseCalculator`,
  `calculator`, `MachineEditor`, `persistence`, `projectList`,
  `LazyOverlays`, `useResolvedTheme`.
- **editor:** `src/editor` without the Verilog files, and `src/io`.
- **hdl:** `src/editor/verilogParse.ts`, `verilogImport.ts` and
  `verilogExport.ts` (only what the user reads, never the code written out).

Check a group's files with `node scripts/i18n-check.ts <files>`;
`src/i18n/i18n.test.ts` checks them all.
