import type { Dictionary } from '../index.ts'

/** Hebrew for the messages of the files listed in `docs/hebrew.md` under "chrome". */
export const chrome: Dictionary = {
  // language.ts and commands.ts: the language of the interface.
  'Show the interface in English': 'הצגת הממשק באנגלית',
  'Show the interface in Hebrew': 'הצגת הממשק בעברית',
  // offline.ts: a new release.
  'A new version of Bitwise is ready.': 'גרסה חדשה של Bitwise מוכנה.',
  Reload: 'טעינה מחדש',
  // desktop.ts: the kinds of files in the system's dialogs.
  'Bitwise project': 'פרויקט Bitwise',
  'SVG picture': 'תמונת SVG',
  Verilog: 'Verilog',
  'VCD waves': 'גלי VCD',
  // commands.ts
  File: 'קובץ',
  Edit: 'עריכה',
  View: 'תצוגה',
  Simulation: 'סימולציה',
  'Add a part': 'הוספת רכיב',
  'Go to the home screen': 'מעבר למסך הבית',
  'Your projects and the examples, with pictures': 'הפרויקטים שלך והדוגמאות, עם תמונות',
  'Show the versions of this project': 'הצגת הגרסאות של הפרויקט',
  'Save a version, or go back to one': 'שמירת גרסה, או חזרה לגרסה קודמת',
  'Present full screen': 'הצגה במסך מלא',
  'Only the canvas and the steps, with a laser pointer': 'רק הקנבס וצעדי המצגת, עם סמן לייזר',
  'Save the project as a file': 'שמירת הפרויקט כקובץ',
  'Build a circuit from an expression': 'בניית מעגל מביטוי',
  'Type a & ~b | c and get the fewest gates as a new circuit':
    'מקלידים ביטוי כמו a & ~b | c ומקבלים מעגל חדש עם מספר השערים הקטן ביותר',
  'Build circuits from Verilog': 'בניית מעגלים מ-Verilog',
  'Paste modules or open a .v file, and get each module as a new circuit. Radix 2 only':
    'מדביקים מודולים או פותחים קובץ Verilog, וכל מודול נעשה מעגל חדש. בבסיס 2 בלבד',
  'Copy a link to this project': 'העתקת קישור לפרויקט',
  'The whole project rides in the link; no file needed': 'כל הפרויקט נמצא בתוך הקישור, בלי צורך בקובץ',
  'Export this circuit as an SVG picture': 'ייצוא המעגל כתמונת SVG',
  'Export this circuit as Verilog': 'ייצוא המעגל ל-Verilog',
  'A .v file with a module for it and for each circuit it uses. Radix 2 only':
    'קובץ Verilog עם מודול למעגל ולכל מעגל שהוא משתמש בו. בבסיס 2 בלבד',
  'Hide the problems': 'הסתרת הבעיות',
  'Show the problems': 'הצגת הבעיות',
  'Floating inputs, conflicts, loops and parts that drive nothing':
    'כניסות צפות, התנגשויות, לולאות ורכיבים שלא מזינים דבר',
  'Show the edit history': 'הצגת היסטוריית העריכה',
  'Every edit by name; pick one to go back to it': 'כל עריכה בשמה; בוחרים אחת כדי לחזור אליה',
  'Select everything': 'בחירת הכול',
  'Copy the selection': 'העתקת הבחירה',
  'Rotate the selection': 'סיבוב הבחירה',
  'Delete the selection': 'מחיקת הבחירה',
  'Arrange the circuit left to right': 'סידור המעגל משמאל לימין',
  'Each part a column after what feeds it; frames move as one block':
    'כל רכיב בעמודה שאחרי מה שמזין אותו; מסגרות זזות כגוש אחד',
  'Describe the circuit in words': 'תיאור המעגל במילים',
  'What it is made of and what each output depends on': 'ממה הוא בנוי ובמה תלויה כל יציאה',
  'Put a frame around the selection': 'הוספת מסגרת סביב הבחירה',
  'Turn the selection into a circuit': 'הפיכת הבחירה למעגל',
  'Pause the simulation': 'עצירת הסימולציה',
  'Run the simulation': 'הפעלת הסימולציה',
  'Step one tick': 'צעד של טיק אחד',
  'Step back one tick': 'צעד אחורה בטיק אחד',
  'Step to the next rising edge of the clock': 'צעד עד החזית העולה הבאה של השעון',
  'Restart the circuit from time 0': 'התחלת המעגל מחדש מזמן 0',
  'Hide the timing diagram': 'הסתרת דיאגרמת התזמון',
  'Show the timing diagram': 'הצגת דיאגרמת התזמון',
  'Hide the presentation steps': 'הסתרת צעדי המצגת',
  'Show the presentation steps': 'הצגת צעדי המצגת',
  'Close the logic settings': 'סגירת הגדרות הלוגיקה',
  'Open the logic settings': 'פתיחת הגדרות הלוגיקה',
  'Hide the cone of influence': 'הסתרת חרוט ההשפעה',
  'Lights up what the selection drives and fades what has nothing to do with it':
    'מאיר את מה שהבחירה מזינה ומעמעם את מה שלא קשור אליה',
  'Open the base calculator': 'פתיחת מחשבון הבסיסים',
  'Zoom in': 'הגדלת התצוגה',
  'Zoom out': 'הקטנת התצוגה',
  'Reset zoom to 100%': 'החזרת הזום ל-100%',
  'Fit the circuit to the screen': 'התאמת המעגל למסך',
  'Switch to light theme': 'מעבר לערכת נושא בהירה',
  'Switch to dark theme': 'מעבר לערכת נושא כהה',
  'Follow the system theme': 'ערכת נושא לפי המערכת',
  'Paint the canvas: {look}': 'מראה הקנבס: {look}',
  'Draw gates as ANSI shapes': 'ציור שערים בצורות ANSI',
  'Draw gates as IEC boxes': 'ציור שערים כמלבני IEC',
  'Add {part}': 'הוספת {part}',
  'Open circuit {name}': 'פתיחת המעגל {name}',
  'Add circuit {name} as a part': 'הוספת המעגל {name} כרכיב',
  'Add an empty circuit': 'הוספת מעגל ריק',
  'Open example: {name}': 'פתיחת דוגמה: {name}',
  'Show keyboard shortcuts': 'הצגת קיצורי המקשים',
  'Take the tour': 'יציאה לסיור',

  // Toolbar.tsx
  'Full speed': 'מהירות מלאה',
  '1 tick/s': 'טיק אחד/ש׳',
  '{speed} ticks/s': '{speed} טיקים/ש׳',
  'Step back one tick (nothing to go back to yet)': 'צעד אחורה בטיק אחד (עדיין אין לאן לחזור)',
  'Step to the next clock edge (this circuit has no clock)':
    'צעד עד החזית הבאה של השעון (אין שעון במעגל הזה)',
  'Simulation speed': 'מהירות הסימולציה',
  'Present full screen: only the canvas and the steps (Esc to leave)':
    'הצגה במסך מלא: רק הקנבס והצעדים (Esc ליציאה)',
  'Project files, examples and shortcuts': 'קובצי פרויקט, דוגמאות וקיצורי מקשים',
  Home: 'מסך הבית',
  'A .v file, at radix 2': 'קובץ Verilog, בבסיס 2',
  'Paste code or open a .v file': 'הדבקת קוד או פתיחת קובץ Verilog',
  'Open an example as a new project': 'פתיחת דוגמה כפרויקט חדש',
  'Go back to any edit by name': 'חזרה לכל עריכה לפי השם שלה',
  'Arrange the circuit': 'סידור המעגל',
  'Left to right by depth, as one edit': 'משמאל לימין לפי עומק, בעריכה אחת',
  'Base n, decimal and balanced': 'בסיס n, עשרוני ומאוזן',
  Sandbox: 'ארגז חול',
  'Search actions': 'חיפוש פעולות',
  'Search actions, parts, circuits and examples (Ctrl+K)': 'חיפוש פעולות, רכיבים, מעגלים ודוגמאות (Ctrl+K)',
  'Logic settings: values per wire, gate kit and colors': 'הגדרות הלוגיקה: ערכים לכל חוט, ערכת שערים וצבעים',
  'Radix {radix}': 'בסיס {radix}',
  'Zoom {percent}%. Reset to 100%': 'זום {percent}%. החזרה ל-100%',

  // shortcuts.ts, Keys.tsx, ShortcutsSheet.tsx
  Project: 'פרויקט',
  'Search actions, parts, circuits and examples': 'חיפוש פעולות, רכיבים, מעגלים ודוגמאות',
  'Show this list': 'הצגת הרשימה הזאת',
  Editing: 'עריכה',
  'Copy, cut and paste': 'העתקה, גזירה והדבקה',
  'Add a part where the pointer is': 'הוספת רכיב במקום שבו נמצא הסמן',
  'Move the selection one grid step': 'הזזת הבחירה במשבצת אחת',
  'Drag a copy of the selection': 'גרירת עותק של הבחירה',
  'Cancel what you are doing, or clear the selection': 'ביטול הפעולה הנוכחית, או ניקוי הבחירה',
  'Zoom in and out. Over a switch: step its value': 'הגדלה והקטנה של התצוגה. מעל מתג: שינוי הערך שלו',
  'Pan the canvas': 'הזזת התצוגה על הקנבס',
  'From a pin or a wire: draw a wire. From a selected wire: move that stretch of it. From empty canvas: select an area':
    'מפין או מחוט: ציור חוט. מחוט בחור: הזזת הקטע הזה שלו. ממקום ריק בקנבס: בחירת אזור',
  'On a wire: show it in the timing diagram, or take it away': 'על חוט: הצגתו בדיאגרמת התזמון, או הסרתו ממנה',
  'Open the circuit a part stands for': 'פתיחת המעגל שרכיב מייצג',
  'Step a switch to its next value': 'העברת מתג לערך הבא שלו',
  'Step a switch back one value': 'החזרת מתג לערך הקודם שלו',
  'Step the switch or press the button it belongs to': 'שינוי המתג, או לחיצה על הכפתור, שהמקש שייך לו',
  'With the pointer on a switch: put it on that value': 'כשהסמן על מתג: העברת המתג לערך הזה',
  'Walk the presentation steps while their panel is open': 'מעבר בין צעדי המצגת כשהחלונית שלהם פתוחה',
  Click: 'לחיצה',
  'Right-click': 'לחיצה ימנית',
  'Double-click': 'לחיצה כפולה',
  Drag: 'גרירה',
  Scroll: 'גלילה',
  'A key you chose': 'מקש שנבחר',
  'Keyboard shortcuts': 'קיצורי מקשים',
  'Close the shortcuts': 'סגירת קיצורי המקשים',
  'Close the shortcuts (Esc)': 'סגירת קיצורי המקשים (Esc)',

  // CommandPalette.tsx
  'Search parts to add where the pointer is': 'חיפוש רכיב להוספה במקום שבו נמצא הסמן',
  Actions: 'פעולות',
  'No part matches “{query}”. Try a name such as “counter” or “and”.':
    'אין רכיב שמתאים ל-"{query}". אפשר לנסות שם כמו "מונה" או "and".',
  'Nothing matches “{query}”. Try the name of a part, such as “counter”, or an action, such as “save”.':
    'שום דבר לא מתאים ל-"{query}". אפשר לנסות שם של רכיב, כמו "מונה", או פעולה, כמו "שמירה".',
  'Clear the search': 'ניקוי החיפוש',

  // StatusBar.tsx
  '1 wire': 'חוט אחד',
  '{count} wires': '{count} חוטים',
  'Release over the canvas to place the part.': 'משחררים מעל הקנבס כדי להניח את הרכיב.',
  'The panel shows what this wire carries. It can also pause the run for you.':
    'החלונית מראה מה החוט הזה נושא, ואפשר גם לקבוע בה נקודת עצירה לריצה.',
  'Double-click the part to open its circuit. Drag to move, R to rotate.':
    'לחיצה כפולה על הרכיב פותחת את המעגל שלו. גוררים כדי להזיז, R לסיבוב.',
  '1 selected. Drag to move, R to rotate, Delete to remove.':
    'פריט אחד נבחר. גוררים כדי להזיז, R לסיבוב, Delete להסרה.',
  '{count} selected. Drag to move, R to rotate, Delete to remove.':
    'נבחרו {count} פריטים. גוררים כדי להזיז, R לסיבוב, Delete להסרה.',
  'Scroll to zoom. Hold Space and drag to pan.':
    'גוללים כדי לשנות את הזום. מחזיקים Space וגוררים כדי להזיז את התצוגה.',
  'Click or scroll over an input to step its value, or type a digit. Shift-click steps back.':
    'לוחצים או גוללים מעל כניסה כדי לשנות את הערך שלה, או מקלידים ספרה. לחיצה עם Shift מחזירה צעד אחורה.',
  'Drag from a pin to another pin or onto a wire to connect them.':
    'גוררים מפין לפין אחר או אל חוט כדי לחבר ביניהם.',
  Paused: 'בעצירה',
  'Paused, changes waiting': 'בעצירה, יש שינויים ממתינים',
  Settled: 'יציב',
  'Show the problems of this circuit': 'הצגת הבעיות של המעגל הזה',
  'No problems': 'אין בעיות',
  '1 problem': 'בעיה אחת',
  '{count} problems': '{count} בעיות',
  'Two outputs drive the same wire to different values': 'שתי יציאות מזינות את אותו חוט בערכים שונים',
  '1 wire in conflict': 'חוט אחד בהתנגשות',
  '{count} wires in conflict': '{count} חוטים בהתנגשות',
  'A breakpoint on a wire paused the run': 'נקודת עצירה על חוט עצרה את הריצה',
  'Paused at a breakpoint: the wire is in conflict': 'הריצה נעצרה בנקודת עצירה: החוט בהתנגשות',
  'Paused at a breakpoint: the wire is {value}': 'הריצה נעצרה בנקודת עצירה: ערך החוט {value}',
  'This circuit has no clock, yet it keeps changing: a loop in it feeds itself and never comes to rest':
    'אין במעגל הזה שעון, ובכל זאת הוא ממשיך להשתנות: לולאה בתוכו מזינה את עצמה ולא נרגעת לעולם',
  'Never settles': 'לא מתייצב',
  '{state}, tick {time}': '{state}, טיק {time}',
  'Parts that do work, counting the ones inside named circuits. The circuit has a loop, so it has no longest path':
    'רכיבים שעושים עבודה, כולל אלה שבתוך מעגלים בעלי שם. יש במעגל לולאה, ולכן אין לו מסלול ארוך ביותר',
  '1 gate, has a loop': 'שער אחד, יש לולאה',
  '{count} gates, has a loop': '{count} שערים, יש לולאה',
  'Stop marking the longest path on the canvas': 'הפסקת הסימון של המסלול הארוך ביותר בקנבס',
  'Parts that do work, counting the ones inside named circuits, and the longest path through them in ticks. Click to mark that path on the canvas':
    'רכיבים שעושים עבודה, כולל אלה שבתוך מעגלים בעלי שם, והמסלול הארוך ביותר דרכם בטיקים. לוחצים כדי לסמן את המסלול בקנבס',
  '1 gate, depth {depth}': 'שער אחד, עומק {depth}',
  '{count} gates, depth {depth}': '{count} שערים, עומק {depth}',
  "The browser's storage is full or switched off. Save the project as a file to keep it":
    'האחסון של הדפדפן מלא או כבוי. כדי לא לאבד את הפרויקט, שומרים אותו כקובץ',
  'Not saved in this browser': 'לא נשמר בדפדפן הזה',

  // CircuitTabs.tsx
  '{list} and {last}': '{list} ו-{last}',
  'The circuit and everything drawn in it will be gone. This cannot be undone.':
    'המעגל וכל מה שמצויר בו יימחקו. אי אפשר לבטל את זה.',
  'It is used in {circuits}. Those parts are removed with it.':
    'משתמשים בו ב-{circuits}. הרכיבים האלה יימחקו יחד איתו.',
  'Delete “{name}”?': 'למחוק את "{name}"?',
  'Delete circuit': 'מחיקת המעגל',
  'Circuit name': 'שם המעגל',
  '{name}. Double-click or press F2 to rename': 'המעגל {name}. לחיצה כפולה או F2 לשינוי השם',
  'Open {name}': 'פתיחת {name}',
  'Delete circuit {name}': 'מחיקת המעגל {name}',

  // CanvasView.tsx, Minimap.tsx, LaserPointer.tsx, ToastHost.tsx
  'Circuit canvas': 'קנבס המעגל',
  'This circuit is empty': 'המעגל הזה ריק',
  'Drag or click a part in the palette, {examples} or {search}.':
    'גוררים רכיב מהפלטה או לוחצים עליו, {examples} או {search}.',
  example: 'דוגמה',
  'browse examples': 'מעיינים בדוגמאות',
  'add ': 'הוספת ',
  'search parts': 'מחפשים רכיבים',
  'Overview. Drag to move around the circuit': 'מבט כולל. גוררים כדי לנוע במעגל',
  'Exit presentation': 'יציאה מהמצגת',
  'Dismiss this message': 'סגירת ההודעה',

  // Tour.tsx, tour.ts
  'Step {step} of {count}': 'צעד {step} מתוך {count}',
  'Skip the tour': 'דילוג על הסיור',
  Back: 'הקודם',
  Next: 'הבא',
  'Start building': 'התחלת הבנייה',
  'Pick a part': 'בחירת רכיב',
  'Drag a part onto the canvas, or click it. The search field finds any part by its name or by what it does.':
    'גוררים רכיב אל הקנבס, או לוחצים עליו. שדה החיפוש מוצא כל רכיב לפי השם שלו או לפי מה שהוא עושה.',
  'Wire it up': 'חיבור בחוטים',
  'Drag from one pin to another to connect them. Click a switch to change its value, and the wires take its color.':
    'גוררים מפין אחד לאחר כדי לחבר ביניהם. לוחצים על מתג כדי לשנות את הערך שלו, והחוטים מקבלים את הצבע שלו.',
  'Run, pause and step': 'הפעלה, עצירה וצעדים',
  'The circuit runs while you build it. Pause it to go through time one tick at a time, forward or back.':
    'המעגל פועל בזמן הבנייה. עוצרים אותו כדי לעבור בזמן טיק אחר טיק, קדימה או אחורה.',
  'Find anything': 'חיפוש של כל דבר',
  'Ctrl+K searches every action, part and example. The File menu holds the ready-made examples and the list of shortcuts.':
    'הקיצור Ctrl+K מחפש כל פעולה, רכיב ודוגמה. בתפריט "קובץ" נמצאות הדוגמאות המוכנות ורשימת קיצורי המקשים.',
}
