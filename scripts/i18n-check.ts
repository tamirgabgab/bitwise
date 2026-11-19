/*
 * Lists the messages of the given source files that have no Hebrew yet:
 * `node scripts/i18n-check.ts src/ui/Inspector.tsx src/ui/Palette.tsx`.
 * The test `src/i18n/i18n.test.ts` checks every file the same way.
 */
import { readFileSync } from 'node:fs'
import { hebrew } from '../src/i18n/he/index.ts'
import { placesOf, scanMessages } from '../src/i18n/index.ts'

let problems = 0
for (const path of process.argv.slice(2)) {
  for (const message of scanMessages(readFileSync(path, 'utf8'))) {
    if (!Object.hasOwn(hebrew, message)) {
      console.log(`${path}: no Hebrew for ${JSON.stringify(message)}`)
      problems++
    } else if (placesOf(message).join() !== placesOf(hebrew[message]).join()) {
      console.log(`${path}: the Hebrew of ${JSON.stringify(message)} has other places`)
      problems++
    }
  }
}
console.log(problems === 0 ? 'Every message has its Hebrew.' : `${problems} to fix.`)
process.exitCode = problems === 0 ? 0 : 1
