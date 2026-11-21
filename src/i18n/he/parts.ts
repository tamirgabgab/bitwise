import type { Dictionary } from '../index.ts'

/** Hebrew for the messages of the files listed in `docs/hebrew.md` under "parts". */
export const parts: Dictionary = {
  // The names of the parts (src/ui/parts.ts). Gate names stay in English.
  Buffer: 'חוצץ',
  Table: 'שער טבלה',
  Constant: 'קבוע',
  Button: 'כפתור',
  Number: 'תצוגת מספר',
  Clock: 'שעון',
  'SR latch': 'נועל SR',
  'D flip-flop': 'פליפ-פלופ D',
  'T flip-flop': 'פליפ-פלופ T',
  'JK flip-flop': 'פליפ-פלופ JK',
  Cycle: 'מחזור',
  'To bits': 'המרה לביטים',
  'From bits': 'המרה מביטים',
  Splitter: 'מפצל',
  Merger: 'מאחד',
  Multiplexer: 'בורר',
  Demultiplexer: 'מפזר',
  Decoder: 'מפענח',
  Adder: 'מחבר',
  Subtractor: 'מחסר',
  Multiplier: 'מכפל',
  Shifter: 'מזיז',
  Comparator: 'משווה',
  Register: 'רגיסטר',
  Counter: 'מונה',
  'State machine': 'מכונת מצבים',
  Text: 'טקסט',
  Frame: 'מסגרת',
  'Net label': 'תווית רשת',

  // What each part does.
  '1 when every input is 1': '1 כשכל הכניסות הן 1',
  'The smallest of its inputs (min)': 'הערך הקטן ביותר מבין הכניסות (min)',
  '1 when any input is 1': '1 כשלפחות אחת הכניסות היא 1',
  'The largest of its inputs (max)': 'הערך הגדול ביותר מבין הכניסות (max)',
  'Inverts its input': 'הופך את הכניסה',
  'Mirrors its input: x becomes (n − 1) − x': 'משקף את הכניסה: x הופך ל-(n − 1) − x',
  '0 only when every input is 1': '0 רק כשכל הכניסות הן 1',
  'The smallest input plus 1, wrapping around': 'הכניסה הקטנה ביותר ועוד 1, במעגל',
  '1 only when every input is 0': '1 רק כשכל הכניסות הן 0',
  'The largest input plus 1, wrapping around': 'הכניסה הגדולה ביותר ועוד 1, במעגל',
  '1 when an odd number of inputs are 1': '1 כשמספר הכניסות שהן 1 הוא אי-זוגי',
  'The sum of its inputs modulo n': 'סכום הכניסות מודולו n',
  '1 when an even number of inputs are 1': '1 כשמספר הכניסות שהן 1 הוא זוגי',
  'The mirrored sum of its inputs modulo n': 'הסכום המשוקף של הכניסות מודולו n',
  'Passes its input through': 'מעביר את הכניסה כמו שהיא',
  'Adds 1, wrapping around. With two values this is NOT': 'מוסיף 1, במעגל. כשיש שני ערכים זה NOT',
  'Adds 1, wrapping around: n − 1 becomes 0': 'מוסיף 1, במעגל: n − 1 הופך ל-0',
  'The sum of its inputs modulo 2, which is XOR': 'סכום הכניסות מודולו 2, כלומר XOR',
  'The product of its inputs, which is AND': 'מכפלת הכניסות, כלומר AND',
  'The product of its inputs modulo n': 'מכפלת הכניסות מודולו n',
  'Gives 1 when its input is the chosen value, otherwise 0': 'נותן 1 כשהכניסה שווה לערך שנבחר, ואחרת 0',
  'Gives the top value when its input is the chosen value, otherwise 0':
    'נותן את הערך העליון כשהכניסה שווה לערך שנבחר, ואחרת 0',
  'Gives what you write in its table for each input': 'נותן לכל כניסה את מה שכותבים בטבלה שלו',
  'Gives what you write in its table for each input, at any radix':
    'נותן לכל כניסה את מה שכותבים בטבלה שלו, בכל בסיס',
  'Always gives the chosen value': 'נותן תמיד את הערך שנבחר',
  'Click it to switch between 0 and 1': 'לוחצים עליו כדי לעבור בין 0 ל-1',
  'Click it to step through the values. Shift-click or right-click steps back':
    'לוחצים עליו כדי לעבור בין הערכים. לחיצה עם Shift או לחיצה ימנית חוזרת אחורה',
  'Gives 1 while you hold it down': 'נותן 1 כל עוד לוחצים עליו',
  'Gives the top value while you hold it down': 'נותן את הערך העליון כל עוד לוחצים עליו',
  'Shows the value that reaches it': 'מציג את הערך שמגיע אליו',
  'Shows its inputs as one binary number, and what it is worth in decimal':
    'מציג את הכניסות כמספר בינארי אחד, ואת ערכו בעשרוני',
  'Shows its inputs as one number in base n, and what it is worth in decimal':
    'מציג את הכניסות כמספר אחד בבסיס n, ואת ערכו בעשרוני',
  'Switches between 0 and 1 on its own, at a steady pace': 'מתחלף מעצמו בין 0 ל-1, בקצב קבוע',
  'Switches between 0 and the top value on its own, at a steady pace':
    'מתחלף מעצמו בין 0 לערך העליון, בקצב קבוע',
  'Remembers one bit: S sets it to 1, R clears it to 0': 'זוכר ביט אחד: S קובע אותו ל-1, ו-R מאפס אותו ל-0',
  'Remembers a value: S at the top value sets it to the top value, R at the top value clears it to 0':
    'זוכר ערך: S בערך העליון קובע אותו לערך העליון, ו-R בערך העליון מאפס אותו ל-0',
  'Takes the value of D each time the clock rises, and keeps it until the next':
    'לוקח את הערך של D בכל עלייה של השעון, ושומר אותו עד העלייה הבאה',
  'Takes the value of D each time the clock rises past the middle, and keeps it until the next':
    'לוקח את הערך של D בכל פעם שהשעון עולה מעבר לאמצע, ושומר אותו עד הפעם הבאה',
  'Flips each time the clock rises while T is 1': 'מתהפך בכל עלייה של השעון כש-T הוא 1',
  'Adds the value of T, wrapping around, each time the clock rises past the middle':
    'מוסיף את הערך של T, במעגל, בכל פעם שהשעון עולה מעבר לאמצע',
  'When the clock rises: J sets it to 1, K clears it to 0, and both together flip it':
    'בעליית השעון: J קובע אותו ל-1, K מאפס אותו ל-0, ושניהם יחד הופכים אותו',
  'When the clock rises past the middle: J at the top value sets it to the top value, K clears it to 0, and both together add 1':
    'כשהשעון עולה מעבר לאמצע: J בערך העליון קובע אותו לערך העליון, K מאפס אותו ל-0, ושניהם יחד מוסיפים 1',
  'Switches between 0 and 1 on its own, like a slow clock': 'מתחלף מעצמו בין 0 ל-1, כמו שעון איטי',
  'Steps through every value from 0 to the top on its own, then starts again':
    'עובר מעצמו על כל הערכים מ-0 ועד הערך העליון, ומתחיל שוב',
  'Writes a number in binary. With two values a digit is one bit already':
    'כותב מספר בבינארי. כשיש שני ערכים, ספרה היא כבר ביט אחד',
  'Writes a digit in binary, one wire per bit. A bit is 0 or the top value':
    'כותב ספרה בבינארי, חוט לכל ביט. ביט הוא 0 או הערך העליון',
  'Reads bits as one number. With two values a digit is one bit already':
    'קורא ביטים כמספר אחד. כשיש שני ערכים, ספרה היא כבר ביט אחד',
  'Reads bits as one digit. A bit is 0 or the top value': 'קורא ביטים כספרה אחת. ביט הוא 0 או הערך העליון',
  'Takes a bus apart into its wires. Set the width of a part in its settings to make a bus':
    'מפרק באס לחוטים שלו. כדי ליצור באס, קובעים את הרוחב של רכיב בהגדרות שלו',
  'Puts wires together into one bus, the lowest digit on top': 'מחבר חוטים לבאס אחד, הספרה הנמוכה למעלה',
  'Passes on input 0 or input 1, whichever Sel names': 'מעביר את כניסה 0 או את כניסה 1, לפי מה ש-Sel מציין',
  'Passes on the input that Sel names. One select digit chooses among n inputs':
    'מעביר את הכניסה ש-Sel מציין. ספרת בחירה אחת בוחרת מבין n כניסות',
  'Sends its input to output 0 or output 1, whichever Sel names. The other gives 0':
    'שולח את הכניסה ליציאה 0 או ליציאה 1, לפי מה ש-Sel מציין. היציאה האחרת נותנת 0',
  'Sends its input to the output that Sel names. The others give 0':
    'שולח את הכניסה ליציאה ש-Sel מציין. האחרות נותנות 0',
  'Gives 1 on the output that Sel names and 0 on the others': 'נותן 1 ביציאה ש-Sel מציין, ו-0 באחרות',
  'Gives the top value on the output that Sel names and 0 on the others':
    'נותן את הערך העליון ביציאה ש-Sel מציין, ו-0 באחרות',
  'Adds two binary numbers on buses, with a carry in and a carry out':
    'מחבר שני מספרים בינאריים על באסים, עם נשא נכנס ונשא יוצא',
  'Adds two numbers in base n on buses. A carry is 0 or the top value':
    'מחבר שני מספרים בבסיס n על באסים. נשא הוא 0 או הערך העליון',
  'Takes B and a borrow in from A, on buses. Bout is 1 when B was more':
    'מחסר מ-A את B ואת הלווה הנכנס, על באסים. Bout הוא 1 כש-B היה גדול יותר',
  'Takes B and a borrow in from A, in base n on buses. Bout is the top value when B was more':
    'מחסר מ-A את B ואת הלווה הנכנס, בבסיס n על באסים. Bout הוא הערך העליון כש-B היה גדול יותר',
  'Multiplies two binary numbers on buses. The product is twice as wide':
    'מכפיל שני מספרים בינאריים על באסים. המכפלה רחבה פי שניים',
  'Multiplies two numbers in base n on buses. The product is twice as wide':
    'מכפיל שני מספרים בבסיס n על באסים. המכפלה רחבה פי שניים',
  'Op picks what to do with A and B: add, subtract, AND, OR, XOR, NOT, shift up or down':
    'הכניסה Op בוחרת מה עושים ב-A וב-B: חיבור, חיסור, AND, OR, XOR, NOT, הזזה למעלה או למטה',
  'Op picks what to do with A and B in base n: add, subtract, AND, OR, XOR, NOT, shift up or down':
    'הכניסה Op בוחרת מה עושים ב-A וב-B בבסיס n: חיבור, חיסור, AND, OR, XOR, NOT, הזזה למעלה או למטה',
  'Moves the bits of its input by as many places as Amt says, bringing in zeros or wrapping around':
    'מזיז את הביטים של הכניסה במספר המקומות ש-Amt מציין, ומכניס אפסים או מסובב במעגל',
  'Moves the digits of its input by as many places as Amt says, bringing in zeros or wrapping around':
    'מזיז את הספרות של הכניסה במספר המקומות ש-Amt מציין, ומכניס אפסים או מסובב במעגל',
  'Compares two numbers on buses: less, equal or greater': 'משווה שני מספרים על באסים: קטן, שווה או גדול',
  'Compares two numbers in base n on buses. The answer that holds gives the top value':
    'משווה שני מספרים בבסיס n על באסים. התשובה הנכונה נותנת את הערך העליון',
  'Takes the bus at D each time the clock rises while En is 1, and keeps it':
    'לוקח את הבאס שב-D בכל עלייה של השעון כש-En הוא 1, ושומר אותו',
  'Takes the bus at D each time the clock rises past the middle while En is at the top value':
    'לוקח את הבאס שב-D בכל פעם שהשעון עולה מעבר לאמצע כש-En בערך העליון',
  'Goes one up each time the clock rises. Load takes D instead, R clears it':
    'עולה באחד בכל עלייה של השעון. Load לוקח במקום זה את D, ו-R מאפס אותו',
  'Goes one up in base n each time the clock rises past the middle. Load takes D instead, R clears it':
    'עולה באחד בבסיס n בכל פעם שהשעון עולה מעבר לאמצע. Load לוקח במקום זה את D, ו-R מאפס אותו',
  'Gives the word kept at the address on A. The words are filled in the inspector':
    'נותן את המילה השמורה בכתובת שב-A. את המילים ממלאים בחלונית המאפיינים',
  'Gives the word kept at the address on A, in base n. The words are filled in the inspector':
    'נותן את המילה השמורה בכתובת שב-A, בבסיס n. את המילים ממלאים בחלונית המאפיינים',
  'Gives the word at the address on A, and writes D there when the clock rises while WE is 1':
    'נותן את המילה שבכתובת שב-A, וכותב לשם את D בעליית השעון כש-WE הוא 1',
  'Gives the word at the address on A, and writes D there when the clock rises past the middle while WE is at the top value':
    'נותן את המילה שבכתובת שב-A, וכותב לשם את D כשהשעון עולה מעבר לאמצע ו-WE בערך העליון',
  'Moves between the states you draw when the clock rises, Moore or Mealy. Double-click it to draw them':
    'עובר בעליית השעון בין המצבים ששרטטו, Moore או Mealy. לוחצים עליו פעמיים כדי לשרטט אותם',
  'Moves between the states you draw when the clock rises past the middle, Moore or Mealy. Double-click it to draw them':
    'עובר בין המצבים ששרטטו כשהשעון עולה מעבר לאמצע, Moore או Mealy. לוחצים עליו פעמיים כדי לשרטט אותם',
  'Writing on the canvas. It is not part of the circuit': 'כיתוב על הקנבס. הוא לא חלק מהמעגל',
  'A titled box around part of the drawing. What lies inside moves with it':
    'תיבה עם כותרת סביב חלק מהשרטוט. מה שבתוכה זז איתה',
  'Labels with the same name are connected, with no wire between them':
    'תוויות עם אותו שם מחוברות זו לזו, בלי חוט ביניהן',

  // Counts.
  '1 input': 'כניסה אחת',
  '{count} inputs': '{count} כניסות',
  '1 output': 'יציאה אחת',
  '{count} outputs': '{count} יציאות',
  '{inputs}, {outputs}': '{inputs}, {outputs}',
  '1 part': 'רכיב אחד',
  '{count} parts': '{count} רכיבים',
  '1 state': 'מצב אחד',
  '{count} states': '{count} מצבים',
  '1 rule': 'כלל אחד',
  '{count} rules': '{count} כללים',

  // The palette.
  Parts: 'רכיבים',
  'Search parts': 'חיפוש רכיבים',
  Circuits: 'מעגלים',
  'Circuits you add show up here as parts you can use.': 'מעגלים שמוסיפים מופיעים כאן כרכיבים לשימוש.',
  'Add a circuit': 'הוספת מעגל',
  '{name}: {shape}. Drag onto the canvas, or click.': '{name}: {shape}. גוררים אל הקנבס, או לוחצים.',
  '{name} has {open} inside it, so it cannot go in here.':
    '"{name}" מכיל את "{open}", ולכן אי אפשר להכניס אותו לכאן.',
  'Used lately': 'בשימוש לאחרונה',
  'No built-in part matches “{query}”.': 'אין רכיב מובנה שמתאים ל-"{query}".',
  '{search} or {clear}.': '{search} או {clear}.',
  'Search all actions': 'חיפוש בכל הפעולות',
  'clear the search': 'ניקוי החיפוש',
  'Inputs and outputs': 'כניסות ויציאות',
  Sequential: 'רכיבים סדרתיים',
  'Digits and bits': 'ספרות וביטים',
  Buses: 'באסים',
  Wiring: 'חיווט',
  'Larger parts': 'רכיבים גדולים',
  Notes: 'הערות',
  'All gates': 'כל השערים',
  Gates: 'שערים',
  '{name} at radix {radix}': '{name} בבסיס {radix}',

  // The inspector: numbers and choices.
  'Select digits': 'ספרות בחירה',
  Matches: 'ערך להשוואה',
  Adds: 'תוספת',
  Digits: 'ספרות',
  'Ticks per half': 'טיקים לחצי מחזור',
  'Ticks per value': 'טיקים לכל ערך',
  Bits: 'ביטים',
  'Address digits': 'ספרות כתובת',
  'Width (digits)': 'רוחב (ספרות)',
  'Digits per branch': 'ספרות לכל ענף',
  'Operation digits': 'ספרות פעולה',
  'Amount digits': 'ספרות הזזה',
  Direction: 'כיוון',
  'Down (right)': 'למטה (ימינה)',
  'Up (left)': 'למעלה (שמאלה)',
  'Brings in': 'מה נכנס',
  Zeros: 'אפסים',
  'The digits pushed out': 'הספרות שנדחפו החוצה',
  '{label}: lower': '{label}: הורדה',
  '{label}: higher': '{label}: העלאה',
  'How many ticks the part takes to answer': 'כמה טיקים לוקח לרכיב להגיב',

  // The inspector: names and keys.
  Key: 'מקש',
  'Press a letter or a digit': 'לוחצים על אות או על ספרה',
  'Key {key}. Press to change it': 'מקש {key}. לוחצים כדי לשנות אותו',
  'No key. Press to choose one': 'אין מקש. לוחצים כדי לבחור',
  'Press a key': 'לוחצים על מקש',
  Choose: 'בחירה',
  'Remove the key': 'הסרת המקש',
  'Use a letter or a digit. R is taken: it rotates.': 'אפשר אות או ספרה. המקש R תפוס: הוא מסובב.',
  'Use up to {width} digits of this radix.': 'אפשר עד {width} ספרות של הבסיס הזה.',
  'Shown on the pin when this circuit is used as a part.': 'מוצג על הפין כשמשתמשים במעגל הזה כרכיב.',
  'A stopped clock gives 0 and lets the circuit settle': 'שעון עצור נותן 0 ומאפשר למעגל להתייצב',
  Running: 'פועל',
  '{name} settings': 'הגדרות {name}',

  // The inspector: a wire.
  Wire: 'חוט',
  '{name}, in conflict': '{name}, בהתנגשות',
  'A bus of {count} digits.': 'באס של {count} ספרות.',
  'Write it as': 'אופן הכתיבה',
  'Pins of different widths are wired together here.': 'כאן מחוברים זה לזה פינים ברוחבים שונים.',
  'Make the widths the same, or use a splitter or a merger.':
    'משווים את הרוחבים, או משתמשים במפצל או במאחד.',
  'Nothing drives it, so it floats.': 'שום רכיב לא מזין אותו, ולכן הוא צף.',
  'Pause when it': 'עצירה כשהוא',
  Never: 'אף פעם',
  Changes: 'משתנה',
  'Is in conflict': 'בהתנגשות',
  'Becomes {value}': 'הופך ל-{value}',
  'Becomes a value': 'מקבל ערך מסוים',
  'Show in the timing diagram': 'הצגה בדיאגרמת התזמון',
  'Pin to the meter board': 'הצמדה ללוח המדידות',
  'Values now': 'הערכים עכשיו',
  'in state': 'במצב',
  'kept inside': 'שמור בפנים',
  'Light up what this drives and fade what has nothing to do with it':
    'הדגשת מה שהבחירה מזינה ועמעום מה שלא קשור אליה',
  'Show the cone of influence': 'הצגת חרוט ההשפעה',

  // The inspector: several parts.
  'Selected parts': 'הרכיבים שנבחרו',
  'Line up': 'יישור',
  'Line up the left edges': 'יישור הקצוות השמאליים',
  'Line up the middles, left to right': 'יישור המרכזים, משמאל לימין',
  'Line up the right edges': 'יישור הקצוות הימניים',
  'Line up the top edges': 'יישור הקצוות העליונים',
  'Line up the middles, top to bottom': 'יישור המרכזים, מלמעלה למטה',
  'Line up the bottom edges': 'יישור הקצוות התחתונים',
  'Space evenly': 'ריווח שווה',
  'Space evenly, left to right': 'ריווח שווה, משמאל לימין',
  'Space evenly, left to right. Needs three parts': 'ריווח שווה, משמאל לימין. דרושים שלושה רכיבים',
  'Space evenly, top to bottom': 'ריווח שווה, מלמעלה למטה',
  'Space evenly, top to bottom. Needs three parts': 'ריווח שווה, מלמעלה למטה. דרושים שלושה רכיבים',
  'Move these parts into a circuit of their own and put one part in their place (Ctrl+G). Switches and outputs stay here':
    'העברת הרכיבים האלה למעגל משלהם והצבת רכיב אחד במקומם (Ctrl+G). המתגים והיציאות נשארים כאן',
  'Make a circuit': 'יצירת מעגל',
  'Draw a titled frame around these parts. What lies inside moves with it':
    'שרטוט מסגרת עם כותרת סביב הרכיבים האלה. מה שבתוכה זז איתה',
  'Add a frame': 'הוספת מסגרת',

  // The inspector: text, frames, net labels and named circuits.
  'Text settings': 'הגדרות טקסט',
  'Writing on the canvas. It is not part of the circuit.': 'כיתוב על הקנבס. הוא לא חלק מהמעגל.',
  'Frame settings': 'הגדרות מסגרת',
  Title: 'כותרת',
  'Not part of the circuit.': 'לא חלק מהמעגל.',
  'Whatever lies wholly inside moves with it.': 'כל מה שנמצא כולו בתוכה זז איתה.',
  'Drag its lower right corner to resize it.': 'גוררים את הפינה הימנית התחתונה כדי לשנות את גודלה.',
  'Net label settings': 'הגדרות תווית רשת',
  // The head of the inspector's sheet on a phone (src/ui/InspectorSheet.tsx).
  'Show settings': 'הצגת ההגדרות',
  'Hide settings': 'הסתרת ההגדרות',
  'Net name': 'שם הרשת',
  'No other label is named {name} yet.': 'עדיין אין תווית אחרת בשם "{name}".',
  'Give one the same name to connect them.': 'נותנים לתווית אחרת אותו שם כדי לחבר ביניהן.',
  'Connected to 1 other label named {name}, as if a wire ran between them.':
    'מחוברת לתווית אחת נוספת בשם "{name}", כאילו עובר ביניהן חוט.',
  'Connected to {count} other labels named {name}, as if a wire ran between them.':
    'מחוברת ל-{count} תוויות נוספות בשם "{name}", כאילו עובר ביניהן חוט.',
  '{name} circuit': 'המעגל "{name}"',
  'Open this circuit. Double-clicking the part does the same': 'פתיחת המעגל הזה. לחיצה כפולה על הרכיב עושה אותו דבר',
  'Open circuit': 'פתיחת המעגל',

  // A table gate.
  'Answers by in0 and in1': 'תשובות לפי in0 ו-in1',
  'Answers by in0': 'תשובות לפי in0',
  '{at} gives {answer}': '{at} נותן {answer}',
  'Click an answer to step it, or type a digit.': 'לוחצים על תשובה כדי לקדם אותה, או מקלידים ספרה.',
  'X leaves it unknown.': 'X משאיר אותה לא ידועה.',

  // ROM and RAM.
  Contents: 'תוכן',
  '{count} words': '{count} מילים',
  Address: 'כתובת',
  'Starts as': 'ערך התחלתי',
  Word: 'מילה',
  Now: 'עכשיו',
  'Word at {address}': 'המילה בכתובת {address}',
  'Words from address {address}': 'מילים החל מכתובת {address}',
  'Words apart by spaces, commas or lines.': 'מפרידים בין המילים ברווחים, בפסיקים או בשורות.',
  'The rest become 0; Undo brings back the old words.': 'השאר יהיו 0, וביטול פעולה מחזיר את המילים הקודמות.',
  'Fill the words': 'מילוי המילים',
  'Fill from text': 'מילוי מטקסט',
  'Type up to {width} digits from 0 to {top}.': 'מקלידים עד {width} ספרות, כל אחת בין 0 ל-{top}.',
  'Write at least one word.': 'צריך לכתוב לפחות מילה אחת.',
  'This memory holds {count} words; the text has {given}.': 'הזיכרון הזה מכיל {count} מילים, ובטקסט יש {given}.',
  '“{word}” is not a word of up to {width} digits from 0 to {top}.':
    '"{word}" אינו מילה של עד {width} ספרות, כל אחת בין 0 ל-{top}.',

  // Truth table, expression and Karnaugh map.
  'Truth table': 'טבלת אמת',
  Expression: 'ביטוי',
  'Karnaugh map': 'מפת קרנו',
  'Karnaugh map of {output}': 'מפת קרנו של {output}',

  // A state machine.
  Machine: 'מכונה',
  'A Mealy machine: {states}, {rules}, {inputs} and {outputs}.': 'מכונת Mealy: {states}, {rules}, {inputs}, {outputs}.',
  'A Moore machine: {states}, {rules}, {inputs} and {outputs}.': 'מכונת Moore: {states}, {rules}, {inputs}, {outputs}.',
  'It starts in {state}.': 'היא מתחילה במצב "{state}".',
  'Edit machine': 'עריכת המכונה',
  'Make a new circuit of D flip-flops and gates that does the same':
    'יצירת מעגל חדש מפליפ-פלופים מסוג D ומשערים, שעושה אותו דבר',
  'Build from gates': 'בנייה משערים',

  // A typed number.
  'Use a whole number from {min} to {max}.': 'צריך מספר שלם בין {min} ל-{max}.',

  // The probe and the names of pins.
  '{part}, pin {pin}': '{part}, פין {pin}',
  '{pin}, inside {circuit}': '{pin}, בתוך {circuit}',
  '{part}, input {pin}': '{part}, כניסה {pin}',
  '{part}, output {pin}': '{part}, יציאה {pin}',
  'Conflict: its outputs disagree': 'התנגשות: היציאות שמזינות אותו לא מסכימות',
  'Pins of different widths are wired together here': 'כאן מחוברים זה לזה פינים ברוחבים שונים',
  'Nothing drives this wire, so it floats.': 'שום רכיב לא מזין את החוט הזה, ולכן הוא צף.',

  // The key to the wire colors.
  'Wire colors': 'צבעי החוטים',
  Floating: 'צף',
  Unknown: 'לא ידוע',
  Conflict: 'התנגשות',

  // Gate kits (src/core/presets.ts).
  'Classic Boolean': 'בוליאני קלאסי',
  'The familiar gates: AND, OR, NOT, NAND, NOR, XOR, XNOR.': 'השערים המוכרים: AND, OR, NOT, NAND, NOR, XOR, XNOR.',
  'NAND only': 'רק NAND',
  'One gate builds everything: min(x, y) + 1.': 'שער אחד בונה הכול: min(x, y) + 1.',
  'Kleene + Shift': 'קלייני + Shift',
  'A true logical NOT, AND as min, and Shift. OR follows by De Morgan.':
    'שלילה לוגית אמיתית (NOT), ‏AND בתור min, ו-Shift. את OR מקבלים לפי דה מורגן.',
  Post: 'פוסט',
  'Two gates: Shift (x + 1) and AND (min).': 'שני שערים: Shift (x + 1) ו-AND (min).',
  'NOR only (Webb)': 'רק NOR (Webb)',
  'One gate builds everything: max(x, y) + 1.': 'שער אחד בונה הכול: max(x, y) + 1.',
  'DNF (detectors)': 'DNF (גלאים)',
  'IS detectors, AND, OR and constants. Any truth table, term by term.':
    'גלאי IS, שערי AND ו-OR, וקבועים. כל טבלת אמת, איבר אחר איבר.',
  'Field arithmetic': 'אריתמטיקה של שדה',
  'ADD and MUL modulo the radix, with a constant.': 'השערים ADD ו-MUL מודולו הבסיס, עם קבוע.',
  'Pure Kleene logic': 'לוגיקת קלייני טהורה',
  'NOT, AND and OR alone. Above radix 2 some tables cannot be built.':
    'השערים NOT, ‏AND ו-OR לבדם. מעל בסיס 2 יש טבלאות שאי אפשר לבנות.',
}
