import type { Dictionary } from '../index.ts'

/** Hebrew for the messages of the files listed in `docs/hebrew.md` under "hdl". */
export const hdl: Dictionary = {
  // ---- Reading the text (verilogParse.ts) ----
  'Only whole numbers are read.': 'נתמכים רק מספרים שלמים.',
  'Signed numbers are not read.': 'מספרים עם סימן (signed) לא נתמכים.',
  'A number is 1 to {max} bits wide.': 'הרוחב של מספר הוא בין 1 ל-{max} ביטים.',
  'A bit left floating (z) is not read.': 'ביט צף (z) לא נתמך.',
  'This is not a decimal number.': 'זה לא מספר עשרוני.',
  'This digit does not belong to the base of the number.': 'הספרה הזו לא שייכת לבסיס של המספר.',
  'This comment is never closed.': 'ההערה הזו לא נסגרת.',
  'This attribute is never closed.': 'המאפיין (attribute) הזה לא נסגר.',
  'Macros and included files are not read. Write the text out in full.':
    'מאקרו וקבצים מצורפים (include) לא נתמכים. כותבים את הטקסט במלואו.',
  'This number is not understood.': 'המספר הזה לא מובן.',
  'System tasks such as $display are not read.': 'משימות מערכת כמו $display לא נתמכות.',
  'Escaped names are not read.': 'שמות עם תו בריחה לא נתמכים.',
  '“{char}” is not understood here.': 'התו "{char}" לא מובן כאן.',
  'A port that is both an input and an output is not read.': 'פורט שהוא גם כניסה וגם יציאה (inout) לא נתמך.',
  'Only wires and regs are read, not integers.': 'נתמכים רק wire ו-reg, לא integer.',
  'Only wires and regs are read, not real numbers.': 'נתמכים רק wire ו-reg, לא מספרים ממשיים.',
  'Only wires and regs are read.': 'נתמכים רק wire ו-reg.',
  'Generated code is not read. Write each part out.': 'קוד מחולל (generate) לא נתמך. כותבים כל רכיב בנפרד.',
  'Loops are not read. Write each part out.': 'לולאות לא נתמכות. כותבים כל רכיב בנפרד.',
  'Loops are not read.': 'לולאות לא נתמכות.',
  'Functions are not read. Write the expression where it is used.':
    'פונקציות לא נתמכות. כותבים את הביטוי במקום שבו משתמשים בו.',
  'Tasks are not read.': 'משימות (task) לא נתמכות.',
  'An initial block is not read. A register starts at 0.': 'בלוק initial לא נתמך. רגיסטר מתחיל ב-0.',
  'A latch is not read. Give the value on a clock edge.': 'נועל (latch) לא נתמך. נותנים את הערך בקצה של שעון.',
  'Only a plain case is read.': 'נתמך רק case רגיל.',
  'Give a module its numbers where it is written.': 'נותנים למודול את הפרמטרים שלו במקום שבו הוא נכתב.',
  'Timing is not read.': 'הגדרות תזמון לא נתמכות.',
  'Only the built-in gates are read.': 'נתמכים רק השערים המובנים.',
  "Write 1'b0 where the value is used.": "כותבים 1'b0 במקום שבו משתמשים בערך.",
  "Write 1'b1 where the value is used.": "כותבים 1'b1 במקום שבו משתמשים בערך.",
  'The name of the block is expected here, not “{found}”.': 'כאן צריך לבוא שם הבלוק, לא "{found}".',
  'The name of the block is expected here, not the end of the text.': 'כאן צריך לבוא שם הבלוק, אבל הטקסט נגמר.',
  'The name of the module is expected here, not “{found}”.': 'כאן צריך לבוא שם המודול, לא "{found}".',
  'The name of the module is expected here, not the end of the text.': 'כאן צריך לבוא שם המודול, אבל הטקסט נגמר.',
  'The name of the number is expected here, not “{found}”.': 'כאן צריך לבוא שם הפרמטר, לא "{found}".',
  'The name of the number is expected here, not the end of the text.': 'כאן צריך לבוא שם הפרמטר, אבל הטקסט נגמר.',
  'The name of the port is expected here, not “{found}”.': 'כאן צריך לבוא שם הפורט, לא "{found}".',
  'The name of the port is expected here, not the end of the text.': 'כאן צריך לבוא שם הפורט, אבל הטקסט נגמר.',
  'The name of the signal is expected here, not “{found}”.': 'כאן צריך לבוא שם האות, לא "{found}".',
  'The name of the signal is expected here, not the end of the text.': 'כאן צריך לבוא שם האות, אבל הטקסט נגמר.',
  'The name of the gate is expected here, not “{found}”.': 'כאן צריך לבוא שם השער, לא "{found}".',
  'The name of the gate is expected here, not the end of the text.': 'כאן צריך לבוא שם השער, אבל הטקסט נגמר.',
  'The name of a module is expected here, not “{found}”.': 'כאן צריך לבוא שם של מודול, לא "{found}".',
  'The name of a module is expected here, not the end of the text.': 'כאן צריך לבוא שם של מודול, אבל הטקסט נגמר.',
  'The name of the part is expected here, not “{found}”.': 'כאן צריך לבוא שם הרכיב, לא "{found}".',
  'The name of the part is expected here, not the end of the text.': 'כאן צריך לבוא שם הרכיב, אבל הטקסט נגמר.',
  '“{wanted}” is expected here, not “{found}”.': 'כאן צריך לבוא "{wanted}", לא "{found}".',
  '“{wanted}” is expected here, not the end of the text.': 'כאן צריך לבוא "{wanted}", אבל הטקסט נגמר.',
  'A memory of several words is not read.': 'זיכרון של כמה מילים לא נתמך.',
  'A value is expected here, not “{found}”.': 'כאן צריך לבוא ערך, לא "{found}".',
  'A value is expected here, not the end of the text.': 'כאן צריך לבוא ערך, אבל הטקסט נגמר.',
  'This delay is never closed.': 'ההשהיה הזו לא נסגרת.',
  'This “begin” has no “end”.': 'ל-"begin" הזה אין "end".',
  'This “case” has no “endcase”.': 'ל-"case" הזה אין "endcase".',
  'A case has one default.': 'ב-case יש default אחד בלבד.',
  'This module has no “endmodule”.': 'למודול הזה אין "endmodule".',
  'An always_ff needs the edge of a clock.': 'בלוק always_ff צריך קצה של שעון.',
  'Give a module its numbers where it is written, not where it is used.':
    'נותנים למודול את הפרמטרים שלו במקום שבו הוא נכתב, לא במקום שבו משתמשים בו.',

  // ---- Building the circuits (verilogImport.ts) ----
  'The high bit of a range has to be a number, known before the circuit runs.':
    'הביט העליון של טווח חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'The high bit of a range is too large.': 'הביט העליון של טווח גדול מדי.',
  'The low bit of a range has to be a number, known before the circuit runs.':
    'הביט התחתון של טווח חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'The low bit of a range is too large.': 'הביט התחתון של טווח גדול מדי.',
  'The place of a bit has to be a number, known before the circuit runs.':
    'המיקום של ביט חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'The place of a bit is too large.': 'המיקום של ביט גדול מדי.',
  'The first bit of a range has to be a number, known before the circuit runs.':
    'הביט הראשון של טווח חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'The first bit of a range is too large.': 'הביט הראשון של טווח גדול מדי.',
  'The width of a range has to be a number, known before the circuit runs.':
    'הרוחב של טווח חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'The width of a range is too large.': 'הרוחב של טווח גדול מדי.',
  'How many times a value is repeated has to be a number, known before the circuit runs.':
    'מספר החזרות על ערך חייב להיות מספר שידוע לפני שהמעגל רץ.',
  'How many times a value is repeated is too large.': 'מספר החזרות על ערך גדול מדי.',
  '“{name}” comes to more than {max} parts and wires, the most one circuit holds.':
    'במודול "{name}" יש יותר מ-{max} רכיבים וחוטים, המספר הגדול ביותר שמעגל אחד מכיל.',
  '“{name}” is a number, not a signal.': 'השם "{name}" הוא פרמטר, לא אות.',
  '“{name}” is not declared.': 'השם "{name}" לא הוצהר.',
  'A value is 1 to {max} bits wide, and this one would be {width}.':
    'הרוחב של ערך הוא בין 1 ל-{max} ביטים, והרוחב של הערך הזה יוצא {width}.',
  'A range runs from the high bit down to the low one, as in [7:0].':
    'טווח נכתב מהביט העליון אל התחתון, כמו [7:0].',
  '“{name}” has no bit there.': 'לאות "{name}" אין ביט במקום הזה.',
  'A range holds at least one bit.': 'טווח מכיל לפחות ביט אחד.',
  '“{name}” does not have all of these bits.': 'לאות "{name}" אין את כל הביטים האלה.',
  'A value is repeated at least once.': 'ערך חוזר לפחות פעם אחת.',
  'This divides by 0.': 'כאן יש חלוקה ב-0.',
  'The gate kit of this project has no gates to build this from.':
    'בערכת השערים של הפרויקט הזה אין שערים שאפשר לבנות מהם את זה.',
  'A multiplier takes numbers of at most {max} bits.': 'מכפל מקבל מספרים של {max} ביטים לכל היותר.',
  'A shift by more than 15 places is not read.': 'הזזה ביותר מ-15 מקומות לא נתמכת.',
  'No part divides or raises to a power. Only numbers known beforehand can be.':
    'אין רכיב שמחלק או מעלה בחזקה. אפשר לעשות זאת רק במספרים שידועים מראש.',
  'A value is given to a signal, to bits of one, or to several in braces.':
    'ערך ניתן לאות, לביטים של אות, או לכמה אותות בסוגריים מסולסלים.',
  '“{name}” is an input: nothing inside the module gives it a value.':
    'האות "{name}" הוא כניסה: שום דבר בתוך המודול לא נותן לו ערך.',
  '“{name}” is given a value in two places.': 'האות "{name}" מקבל ערך בשני מקומות.',
  '“{name}” is not given a value on every path. It would have to remember one, and only a clock edge does that.':
    'האות "{name}" לא מקבל ערך בכל מסלול. הוא היה צריך לזכור ערך, ורק קצה של שעון עושה את זה.',
  '“{name}” is given a value in an always block, so it has to be declared a reg.':
    'האות "{name}" מקבל ערך בבלוק always, ולכן צריך להצהיר עליו כ-reg.',
  'With more than one edge, the block has to start with an “if” on the signal that resets it, as in “if (rst) q <= 0; else …”.':
    'כשיש יותר מקצה אחד, הבלוק חייב להתחיל ב-"if" על האות שמאפס אותו, כמו "if (rst) q <= 0; else …".',
  'A register starts at 0, and “{name}” is said to start at something else.':
    'רגיסטר מתחיל ב-0, ועל "{name}" נאמר שהוא מתחיל בערך אחר.',
  'A register is reset to 0, and one of a single bit can also be set to 1. “{name}” is reset to something else.':
    'רגיסטר מתאפס ל-0, ורגיסטר של ביט אחד יכול גם להיקבע ל-1. האות "{name}" מתאפס לערך אחר.',
  '“{name}” is declared twice.': 'השם "{name}" מוצהר פעמיים.',
  '“{name}” has to be a number.': 'הפרמטר "{name}" חייב להיות מספר.',
  '“{name}” is already the name of a number.': 'השם "{name}" כבר משמש לפרמטר.',
  '“{name}” is a port, and nothing says whether it is an input or an output.':
    'הפורט "{name}" לא מוצהר ככניסה או כיציאה.',
  'An input cannot be a reg, and “{name}” is said to be both.':
    'כניסה לא יכולה להיות reg, ועל "{name}" נאמר שהוא גם וגם.',
  'A gate has an output and at least one input.': 'לשער יש יציאה ולפחות כניסה אחת.',
  'A gate gives one bit, and this signal is wider.': 'שער נותן ביט אחד, והאות הזה רחב יותר.',
  'No module is called “{name}”.': 'אין מודול בשם "{name}".',
  '“{module}” has no port called “{port}”.': 'למודול "{module}" אין פורט בשם "{port}".',
  'The port “{port}” is attached twice.': 'הפורט "{port}" מחובר פעמיים.',
  '“{module}” has {ports} ports, and {attached} are attached here.':
    'מספר הפורטים של "{module}" הוא {ports}, וכאן מחוברים {attached}.',
  'Nothing gives “{name}” a value.': 'שום דבר לא נותן ערך לאות "{name}".',
  '“{name}” is given its own value, with no part in between.':
    'האות "{name}" מקבל את הערך של עצמו, בלי רכיב באמצע.',
  'This text is longer than {max} characters, the most that is read.':
    'הטקסט ארוך מ-{max} תווים, האורך הגדול ביותר שנתמך.',
  'There is no module in this text. A circuit starts with “module”.':
    'אין מודול בטקסט הזה. מעגל מתחיל ב-"module".',
  'Two modules are called “{name}”.': 'יש שני מודולים בשם "{name}".',
  'A project holds at most {max} circuits, and these modules would go past that.':
    'פרויקט מכיל {max} מעגלים לכל היותר, והמודולים האלה יעברו את המספר הזה.',
  '“{name}” would contain itself.': 'המודול "{name}" היה מכיל את עצמו.',
  'Opened up, these modules come to more than {max} parts.':
    'כשפותחים אותם, המודולים האלה מגיעים ליותר מ-{max} רכיבים.',
  'This text is nested too deeply to read.': 'הקינון בטקסט הזה עמוק מדי.',

  // ---- Writing Verilog (verilogExport.ts) ----
  'Verilog is written only at radix 2, where a digit is a bit.': 'קוד Verilog נכתב רק בבסיס 2, שבו ספרה היא ביט.',
  'There is no such circuit.': 'אין מעגל כזה.',
  'A circuit here uses itself or a circuit that is gone, so it cannot be written.':
    'אחד המעגלים כאן משתמש בעצמו או במעגל שכבר לא קיים, ולכן אי אפשר לכתוב אותו.',
  'In “{circuit}” a wire at {part} joins pins of different widths. Make the widths the same first.':
    'במעגל "{circuit}" חוט ליד "{part}" מחבר פינים ברוחבים שונים. קודם משווים את הרוחבים.',
  'A part of type “{type}” cannot be written as Verilog.': 'אי אפשר לכתוב רכיב מסוג "{type}" ב-Verilog.',
}
