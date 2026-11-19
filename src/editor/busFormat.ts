import type { Signal } from '../core/index.ts'
import { t } from '../i18n/index.ts'
import { terminalNets } from './connectivity.ts'
import { terminalKey } from './document.ts'
import type { BusFormat, CircuitDoc, DocWire, Terminal } from './document.ts'

/*
 * How the value of a bus is written. The choice is kept on the wires of the
 * bus, so it is saved with the drawing, and it holds for the whole net: any
 * wire of a net that carries a format gives it to all of them.
 */

/** Every way a bus can be written, in the order the inspector offers them. */
export const BUS_FORMATS: readonly BusFormat[] = ['digits', 'decimal', 'balanced', 'hex']

/** The names of the formats, as the inspector shows them. */
export function busFormatName(format: BusFormat, radix: number): string {
  switch (format) {
    case 'digits':
      return t('Digits in base {radix}', { radix })
    case 'decimal':
      return t('Decimal')
    case 'balanced':
      return t('Balanced, signed')
    case 'hex':
      return t('Hexadecimal')
  }
}

/** The formats that make sense at `radix`: a balanced value needs an odd one. */
export function busFormatsFor(radix: number): BusFormat[] {
  return BUS_FORMATS.filter((format) => format !== 'balanced' || radix % 2 === 1)
}

/**
 * A bus value written in `format`, or undefined when it is to be written as
 * its digits: in the format `digits`, or when a digit is X or Z, since then
 * there is no number to write. Decimal is plain, hex has `0x`, and the
 * balanced value has a sign, each digit counted from the middle of the
 * radix. An even radix has no balanced form, so it falls back to decimal.
 */
export function busText(signal: Signal, radix: number, format: BusFormat): string | undefined {
  if (format === 'digits' || signal.length < 2) return undefined
  if (signal.some((digit) => digit < 0 || digit >= radix)) return undefined
  const base = BigInt(radix)
  const balanced = format === 'balanced' && radix % 2 === 1
  const middle = BigInt(Math.floor((radix - 1) / 2))
  let value = 0n
  for (let i = signal.length - 1; i >= 0; i--) {
    const digit = BigInt(signal[i])
    value = value * base + (balanced ? digit - middle : digit)
  }
  if (format === 'hex') return `0x${value.toString(16).toUpperCase()}`
  if (!balanced) return value.toString()
  if (value === 0n) return '0'
  return value > 0n ? `+${value}` : `−${-value}`
}

const DIGIT_CHARS = '0123456789ABCDEF'

/**
 * The digits of a bus `width` digits wide that `text` names in `format`,
 * the least significant first, or a reason it names none. The digits are
 * written most significant first and may leave out leading zeros; hex may
 * start with `0x`, and a balanced value with a sign.
 */
export function readBusValue(
  text: string,
  radix: number,
  width: number,
  format: BusFormat,
): { readonly signal: Signal } | { readonly problem: string } {
  const written = text.trim().toUpperCase().replace(/\s+/g, '')
  const base = BigInt(radix)
  const room = base ** BigInt(width)
  let value: bigint
  if (format === 'digits') {
    if (!/^[0-9A-F]+$/.test(written) || [...written].some((char) => DIGIT_CHARS.indexOf(char) >= radix)) {
      return { problem: t('Use the digits 0 to {top}.', { top: DIGIT_CHARS[radix - 1] }) }
    }
    value = [...written].reduce((sum, char) => sum * base + BigInt(DIGIT_CHARS.indexOf(char)), 0n)
  } else if (format === 'hex') {
    const hex = written.replace(/^0X/, '')
    if (!/^[0-9A-F]+$/.test(hex)) return { problem: t('Write a hexadecimal number, such as 0x1F.') }
    value = BigInt(`0x${hex}`)
  } else if (format === 'balanced' && radix % 2 === 1) {
    const signed = /^([+\-−]?)(\d+)$/.exec(written)
    if (!signed) return { problem: t('Write a whole number, with a sign if it is below zero.') }
    const middle = BigInt((radix - 1) / 2)
    // Every digit counts from the middle of the radix, so the whole range is moved by this much.
    const shift = (middle * (room - 1n)) / (base - 1n)
    const number = signed[1] === '' || signed[1] === '+' ? BigInt(signed[2]) : -BigInt(signed[2])
    if (number < -shift || number > shift) {
      return { problem: t('Use a number from {low} to {high}.', { low: `−${shift}`, high: `+${shift}` }) }
    }
    value = number + shift
  } else {
    if (!/^\d+$/.test(written)) return { problem: t('Write a whole number, such as 12.') }
    value = BigInt(written)
  }
  if (value >= room) return { problem: t('This bus holds at most {count} digits.', { count: width }) }
  const signal: number[] = []
  for (let at = 0; at < width; at++) {
    signal.push(Number(value % base))
    value /= base
  }
  return { signal }
}

/** The digits of a bus as the timing diagram keeps them, the most significant first. */
function digitsOf(text: string): Signal | undefined {
  const digits: number[] = []
  for (let i = text.length - 1; i >= 0; i--) {
    const digit = DIGIT_CHARS.indexOf(text[i])
    if (digit < 0) return undefined
    digits.push(digit)
  }
  return digits
}

/**
 * A bus value the timing diagram kept as its digits written out, in
 * `format`. Anything that is not a plain number stays as it was.
 */
export function busTextOf(text: string, radix: number, format: BusFormat | undefined): string {
  if (format === undefined || format === 'digits') return text
  const digits = digitsOf(text)
  return (digits && busText(digits, radix, format)) ?? text
}

interface NetFormats {
  readonly nets: Map<string, string>
  readonly formats: Map<string, BusFormat>
}

const formatsOf = new WeakMap<CircuitDoc, NetFormats>()

/**
 * The format of every net that has one, by the net of `terminalNets`, and
 * those nets. Kept per drawing: the canvas asks for every bus of every frame.
 */
function netFormats(doc: CircuitDoc): NetFormats {
  let found = formatsOf.get(doc)
  if (!found) {
    const formats = new Map<string, BusFormat>()
    const nets = terminalNets(doc)
    for (const wire of Object.values(doc.wires)) {
      if (!wire.format) continue
      const net = nets.get(terminalKey(wire.from))
      if (net !== undefined && !formats.has(net)) formats.set(net, wire.format)
    }
    found = { nets, formats }
    formatsOf.set(doc, found)
  }
  return found
}

/** How the bus at `terminal` is written: `digits` unless its net says otherwise. */
export function formatAt(doc: CircuitDoc, terminal: Terminal): BusFormat {
  const { nets, formats } = netFormats(doc)
  if (formats.size === 0) return 'digits'
  const net = nets.get(terminalKey(terminal))
  return (net !== undefined && formats.get(net)) || 'digits'
}

/**
 * Writes the bus at `terminal` in `format` from now on: every wire of its
 * net takes the format, and `digits` takes it away. The same document when
 * nothing changes.
 */
export function setBusFormat(doc: CircuitDoc, terminal: Terminal, format: BusFormat): CircuitDoc {
  const { nets } = netFormats(doc)
  const net = nets.get(terminalKey(terminal))
  if (net === undefined) return doc
  let wires: Record<string, DocWire> | undefined
  for (const wire of Object.values(doc.wires)) {
    if (nets.get(terminalKey(wire.from)) !== net) continue
    const now = wire.format ?? 'digits'
    if (now === format) continue
    wires ??= { ...doc.wires }
    const plain: DocWire = { id: wire.id, from: wire.from, to: wire.to }
    wires[wire.id] = format === 'digits' ? plain : { ...plain, format }
  }
  return wires ? { ...doc, wires } : doc
}
