import { msg } from '../i18n/index.ts'
import { isPrime } from './signal.ts'

/**
 * A gate kit: the basic gates a circuit is meant to be built from.
 *
 * At radix 2 a handful of Boolean gates build everything. With more values
 * there are several good ways to generalize them, and no single best one,
 * so the user picks a kit. Every kit behaves exactly like Boolean logic at
 * radix 2. The reasoning behind each is in docs/n_ary_logic_sim_spec.md.
 */
export interface GatePreset {
  readonly id: string
  readonly name: string
  /** One line for the settings panel. */
  readonly summary: string
  /** Component types, in the order the palette shows them. */
  readonly gates: readonly string[]
  /** 'binary': radix 2 only. 'prime': only when the radix is a prime. */
  readonly needs?: 'binary' | 'prime'
  /** False for a kit that cannot build every truth table above radix 2. */
  readonly universal: boolean
}

export const GATE_PRESETS: readonly GatePreset[] = [
  {
    id: 'classic',
    name: msg('Classic Boolean'),
    summary: msg('The familiar gates: AND, OR, NOT, NAND, NOR, XOR, XNOR.'),
    gates: ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor', 'buffer'],
    needs: 'binary',
    universal: true,
  },
  {
    id: 'nand',
    name: msg('NAND only'),
    summary: msg('One gate builds everything: min(x, y) + 1.'),
    gates: ['nand'],
    universal: true,
  },
  {
    id: 'kleene',
    name: msg('Kleene + Shift'),
    summary: msg('A true logical NOT, AND as min, and Shift. OR follows by De Morgan.'),
    gates: ['not', 'and', 'shift'],
    universal: true,
  },
  {
    id: 'post',
    name: msg('Post'),
    summary: msg('Two gates: Shift (x + 1) and AND (min).'),
    gates: ['shift', 'and'],
    universal: true,
  },
  {
    id: 'nor',
    name: msg('NOR only (Webb)'),
    summary: msg('One gate builds everything: max(x, y) + 1.'),
    gates: ['nor'],
    universal: true,
  },
  {
    id: 'dnf',
    name: msg('DNF (detectors)'),
    summary: msg('IS detectors, AND, OR and constants. Any truth table, term by term.'),
    gates: ['is', 'and', 'or', 'const'],
    universal: true,
  },
  {
    id: 'field',
    name: msg('Field arithmetic'),
    summary: msg('ADD and MUL modulo the radix, with a constant.'),
    gates: ['add', 'mul', 'const'],
    needs: 'prime',
    universal: true,
  },
  {
    id: 'pure',
    name: msg('Pure Kleene logic'),
    summary: msg('NOT, AND and OR alone. Above radix 2 some tables cannot be built.'),
    gates: ['not', 'and', 'or'],
    universal: false,
  },
]

export function findPreset(id: string): GatePreset | undefined {
  return GATE_PRESETS.find((preset) => preset.id === id)
}

/** Whether a kit can be used at this radix. */
export function presetAvailable(preset: GatePreset, radix: number): boolean {
  if (preset.needs === 'binary') return radix === 2
  if (preset.needs === 'prime') return isPrime(radix)
  return true
}

/** Whether a kit can build every truth table at this radix. */
export function presetUniversal(preset: GatePreset, radix: number): boolean {
  return presetAvailable(preset, radix) && (preset.universal || radix === 2)
}

/** The kit a project starts with, and falls back to when its own stops fitting. */
export function defaultPresetId(radix: number): string {
  return radix === 2 ? 'classic' : 'nand'
}

/** Every gate worth offering at this radix, for the sandbox. */
export function sandboxGates(radix: number): readonly string[] {
  const general = ['and', 'or', 'not', 'shift', 'nand', 'nor', 'add', 'mul', 'is', 'const', 'buffer']
  // XOR and XNOR are Boolean names; above radix 2 ADD says what they do.
  return radix === 2 ? [...general, 'xor', 'xnor'] : general
}
