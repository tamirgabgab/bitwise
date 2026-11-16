import { describe, expect, it } from 'vitest'
import { resolveParams } from './component.ts'
import { builtinComponents } from './components/index.ts'
import {
  GATE_PRESETS,
  defaultPresetId,
  findPreset,
  presetAvailable,
  presetUniversal,
  sandboxGates,
} from './presets.ts'

/*
 * The acceptance tests of docs/n_ary_logic_sim_spec.md, section 7. Every
 * derived gate below is built only by calling the real component
 * definitions of one kit, the way a user would wire them.
 */

type Unary = (x: number) => number
type Binary = (x: number, y: number) => number

/** A component as a plain function of digits. */
function gate(type: string, radix: number, params: Record<string, number> = {}) {
  const def = builtinComponents.get(type)
  const resolved = resolveParams(def, params)
  const inputs = def.ports(resolved).filter((port) => port.direction === 'in')
  return (...digits: number[]): number => {
    const values: Record<string, number[]> = {}
    inputs.forEach((port, index) => {
      values[port.name] = [digits[index]]
    })
    return def.evaluate(values, resolved, undefined, { radix }).outputs.out[0]
  }
}

const digitsOf = (radix: number): number[] => Array.from({ length: radix }, (_, i) => i)
const unaryTable = (f: Unary, radix: number): number[] => digitsOf(radix).map(f)
const binaryTable = (f: Binary, radix: number): number[][] =>
  digitsOf(radix).map((x) => digitsOf(radix).map((y) => f(x, y)))

/** Applies a one-input function `times` times. */
const repeat = (f: Unary, times: number): Unary => (x) => {
  let value = x
  for (let i = 0; i < times; i++) value = f(value)
  return value
}

interface Builder {
  constant(c: number): Unary
  unary(table: Unary): Unary
  binary(table: Binary): Binary
}

/**
 * Builds any function from INC (x + 1) and AND (min): the recipe of the
 * specification, section 4.
 */
function fromIncAndMin(inc: Unary, min: Binary, n: number): Builder {
  const top = n - 1
  const shifted = (k: number): Unary => repeat(inc, ((k % n) + n) % n)
  const minOf = (values: number[]): number => values.reduce((a, b) => min(a, b))
  // Step 1: the smallest of x, x+1, ..., x+n-1 is always 0.
  const zero: Unary = (x) => minOf(digitsOf(n).map((k) => shifted(k)(x)))
  const constant = (c: number): Unary => (x) => shifted(c)(zero(x))
  // Step 2: 1 where x = a, 0 elsewhere.
  const indicator = (a: number): Unary => (x) =>
    minOf(digitsOf(n).slice(1).map((k) => shifted(k - a)(x)))
  // Steps 3 and 4: `value` where the indicator fires, the top digit elsewhere.
  const pick = (hit: number, value: number, x: number): number =>
    shifted(value)(min(shifted(top)(hit), constant(top - value)(x)))
  return {
    constant,
    unary: (table) => (x) => minOf(digitsOf(n).map((a) => pick(indicator(a)(x), table(a), x))),
    binary: (table) => (x, y) =>
      minOf(
        digitsOf(n).flatMap((a) =>
          digitsOf(n).map((b) => pick(min(indicator(a)(x), indicator(b)(y)), table(a, b), x)),
        ),
      ),
  }
}

/** The mirror image of `fromIncAndMin`: any function from INC and OR (max). */
function fromIncAndMax(inc: Unary, max: Binary, n: number): Builder {
  const top = n - 1
  const shifted = (k: number): Unary => repeat(inc, ((k % n) + n) % n)
  const maxOf = (values: number[]): number => values.reduce((a, b) => max(a, b))
  // The largest of x, x+1, ..., x+n-1 is always the top digit.
  const full: Unary = (x) => maxOf(digitsOf(n).map((k) => shifted(k)(x)))
  const constant = (c: number): Unary => (x) => shifted(c + 1)(full(x))
  // top - 1 where x = a, the top digit elsewhere.
  const indicator = (a: number): Unary => (x) =>
    maxOf(digitsOf(n - 1).map((k) => shifted(k - a)(x)))
  // `value` where the indicator fires, 0 elsewhere.
  const pick = (hit: number, value: number, x: number): number =>
    shifted(value + 1)(max(shifted(1)(hit), constant(top - value)(x)))
  return {
    constant,
    unary: (table) => (x) => maxOf(digitsOf(n).map((a) => pick(indicator(a)(x), table(a), x))),
    binary: (table) => (x, y) =>
      maxOf(
        digitsOf(n).flatMap((a) =>
          digitsOf(n).map((b) => pick(max(indicator(a)(x), indicator(b)(y)), table(a, b), x)),
        ),
      ),
  }
}

/** Any function as a generalized DNF: OR over IS detectors, AND and constants. */
function fromDetectors(n: number): Builder {
  const and = gate('and', n)
  const or = gate('or', n)
  const is = (a: number) => gate('is', n, { match: a })
  const constant = (c: number): Unary => () => gate('const', n, { value: c })()
  const orOf = (values: number[]): number => values.reduce((a, b) => or(a, b))
  return {
    constant,
    unary: (table) => (x) =>
      orOf(digitsOf(n).map((a) => and(is(a)(x), constant(table(a))(x)))),
    binary: (table) => (x, y) =>
      orOf(
        digitsOf(n).flatMap((a) =>
          digitsOf(n).map((b) => and(and(is(a)(x), is(b)(y)), constant(table(a, b))(x))),
        ),
      ),
  }
}

/**
 * Any function as a polynomial over the field of p elements, from ADD, MUL
 * and the constant 1: Lagrange interpolation with Fermat's little theorem.
 */
function fromField(p: number): Builder {
  const add = gate('add', p)
  const mul = gate('mul', p)
  const one = gate('const', p, { value: 1 })
  const sumOf = (values: number[]): number => values.reduce((a, b) => add(a, b))
  // c as 1 + 1 + ... + 1; p ones make 0.
  const number = (c: number): number => sumOf(new Array<number>(c === 0 ? p : c).fill(one()))
  const power = (x: number, exponent: number): number => {
    let result = one()
    for (let i = 0; i < exponent; i++) result = mul(result, x)
    return result
  }
  // 1 where x = a, 0 elsewhere: 1 - (x - a)^(p - 1).
  const delta = (a: number, x: number): number =>
    add(one(), mul(number(p - 1), power(add(x, number((p - a) % p)), p - 1)))
  return {
    constant: (c) => () => number(c),
    unary: (table) => (x) => sumOf(digitsOf(p).map((a) => mul(number(table(a)), delta(a, x)))),
    binary: (table) => (x, y) =>
      sumOf(
        digitsOf(p).flatMap((a) =>
          digitsOf(p).map((b) => mul(number(table(a, b)), mul(delta(a, x), delta(b, y)))),
        ),
      ),
  }
}

/** How each universal kit builds everything, using only its own gates. */
const BUILDERS: Record<string, (n: number) => Builder> = {
  post: (n) => fromIncAndMin(gate('shift', n), gate('and', n), n),
  kleene: (n) => fromIncAndMin(gate('shift', n), gate('and', n), n),
  nand: (n) => {
    const nand = gate('nand', n)
    const inc: Unary = (x) => nand(x, x)
    return fromIncAndMin(inc, (x, y) => repeat(inc, n - 1)(nand(x, y)), n)
  },
  nor: (n) => {
    const nor = gate('nor', n)
    const inc: Unary = (x) => nor(x, x)
    return fromIncAndMax(inc, (x, y) => repeat(inc, n - 1)(nor(x, y)), n)
  },
  dnf: fromDetectors,
  field: fromField,
}

describe('the list of kits', () => {
  it('names only registered components', () => {
    for (const preset of GATE_PRESETS) {
      for (const type of preset.gates) expect(builtinComponents.has(type)).toBe(true)
    }
    for (let radix = 2; radix <= 16; radix++) {
      for (const type of sandboxGates(radix)) expect(builtinComponents.has(type)).toBe(true)
    }
  })

  it('has unique ids and can be looked up', () => {
    const ids = GATE_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(findPreset('nand')?.gates).toEqual(['nand'])
    expect(findPreset('nope')).toBeUndefined()
  })

  it('starts a project on a kit that fits its radix', () => {
    for (let radix = 2; radix <= 16; radix++) {
      const preset = findPreset(defaultPresetId(radix))
      expect(preset && presetAvailable(preset, radix)).toBe(true)
    }
    expect(defaultPresetId(2)).toBe('classic')
    expect(defaultPresetId(3)).toBe('nand')
  })

  it('offers the classic kit at radix 2 only', () => {
    const classic = findPreset('classic')!
    expect(presetAvailable(classic, 2)).toBe(true)
    expect(presetAvailable(classic, 3)).toBe(false)
  })

  it('offers field arithmetic only when the radix is prime', () => {
    const field = findPreset('field')!
    const allowed = digitsOf(17).filter((n) => n >= 2 && presetAvailable(field, n))
    expect(allowed).toEqual([2, 3, 5, 7, 11, 13])
  })

  it('marks pure Kleene logic as not universal above radix 2', () => {
    const pure = findPreset('pure')!
    expect(presetUniversal(pure, 2)).toBe(true)
    expect(presetUniversal(pure, 3)).toBe(false)
    expect(presetUniversal(findPreset('nand')!, 6)).toBe(true)
    expect(presetUniversal(findPreset('field')!, 4)).toBe(false)
  })

  it('shows the Boolean-only names in the sandbox at radix 2 only', () => {
    expect(sandboxGates(2)).toContain('xor')
    expect(sandboxGates(3)).not.toContain('xor')
    expect(sandboxGates(3)).toContain('add')
  })
})

describe('backward compatibility: every kit is Boolean logic at radix 2', () => {
  const not = [1, 0]
  const and = [
    [0, 0],
    [0, 1],
  ]
  const or = [
    [0, 1],
    [1, 1],
  ]
  const xor = [
    [0, 1],
    [1, 0],
  ]
  const invert = (table: number[][]): number[][] => table.map((line) => line.map((v) => 1 - v))

  it('shift and not are both NOT', () => {
    expect(unaryTable(gate('shift', 2), 2)).toEqual(not)
    expect(unaryTable(gate('not', 2), 2)).toEqual(not)
  })

  it('and, or, nand and nor are themselves', () => {
    expect(binaryTable(gate('and', 2), 2)).toEqual(and)
    expect(binaryTable(gate('or', 2), 2)).toEqual(or)
    expect(binaryTable(gate('nand', 2), 2)).toEqual(invert(and))
    expect(binaryTable(gate('nor', 2), 2)).toEqual(invert(or))
  })

  it('add is XOR and mul is AND', () => {
    expect(binaryTable(gate('add', 2), 2)).toEqual(xor)
    expect(binaryTable(gate('mul', 2), 2)).toEqual(and)
  })

  it('is 1 is the input itself and is 0 is NOT', () => {
    expect(unaryTable(gate('is', 2, { match: 1 }), 2)).toEqual([0, 1])
    expect(unaryTable(gate('is', 2, { match: 0 }), 2)).toEqual(not)
  })

  it('covers every gate of every kit', () => {
    const checked = new Set(['shift', 'not', 'and', 'or', 'nand', 'nor', 'add', 'mul', 'is'])
    // The rest are Boolean by name, or carry no logic of their own.
    const plain = new Set(['xor', 'xnor', 'buffer', 'const'])
    for (const preset of GATE_PRESETS) {
      for (const type of preset.gates) expect(checked.has(type) || plain.has(type)).toBe(true)
    }
  })
})

describe('universality: each kit builds the derived gates', () => {
  const kits = GATE_PRESETS.filter((preset) => preset.id in BUILDERS)

  it('has a recipe for every kit that claims to be universal', () => {
    const claimed = GATE_PRESETS.filter((preset) => preset.universal && preset.id !== 'classic')
    expect(claimed.map((preset) => preset.id).sort()).toEqual(Object.keys(BUILDERS).sort())
  })

  for (const preset of kits) {
    for (const n of [2, 3, 4, 5]) {
      if (!presetAvailable(preset, n)) continue
      const top = n - 1

      it(`${preset.name}, radix ${n}: MIRROR, OR, CONST and IS`, () => {
        const build = BUILDERS[preset.id](n)

        const mirror = build.unary((x) => top - x)
        expect(unaryTable(mirror, n)).toEqual(digitsOf(n).map((x) => top - x))

        const or = build.binary((x, y) => Math.max(x, y))
        expect(binaryTable(or, n)).toEqual(binaryTable((x, y) => Math.max(x, y), n))

        for (const c of digitsOf(n)) {
          expect(unaryTable(build.constant(c), n)).toEqual(new Array(n).fill(c))
        }
        for (const a of digitsOf(n)) {
          const is = build.unary((x) => (x === a ? top : 0))
          expect(unaryTable(is, n)).toEqual(digitsOf(n).map((x) => (x === a ? top : 0)))
        }
      })

      it(`${preset.name}, radix ${n}: AND, ADD and an arbitrary table`, () => {
        const build = BUILDERS[preset.id](n)
        const and: Binary = (x, y) => Math.min(x, y)
        const add: Binary = (x, y) => (x + y) % n
        const odd: Binary = (x, y) => (x * x + 2 * y + 1) % n
        for (const target of [and, add, odd]) {
          expect(binaryTable(build.binary(target), n)).toEqual(binaryTable(target, n))
        }
      })
    }
  }

  it('gets OR from NOT and AND by De Morgan in the Kleene kit', () => {
    for (const n of [2, 3, 4, 5]) {
      const not = gate('not', n)
      const and = gate('and', n)
      const or: Binary = (x, y) => not(and(not(x), not(y)))
      expect(binaryTable(or, n)).toEqual(binaryTable((x, y) => Math.max(x, y), n))
    }
  })
})

describe('kits that are not universal', () => {
  /** Every one-input function reachable from the given ones. */
  function closure(n: number, start: number[][], combine: Binary[]): Set<string> {
    const found = new Map<string, number[]>()
    const queue: number[][] = []
    const offer = (f: number[]): void => {
      const key = f.join(',')
      if (found.has(key)) return
      found.set(key, f)
      queue.push(f)
    }
    start.forEach(offer)
    while (queue.length > 0) {
      const f = queue.pop() as number[]
      for (const g of [...found.values()]) {
        for (const op of combine) {
          offer(digitsOf(n).map((x) => op(f[x], g[x])))
          offer(digitsOf(n).map((x) => op(g[x], f[x])))
        }
      }
    }
    return new Set(found.keys())
  }

  it('field arithmetic reaches only 64 of the 256 one-input functions at radix 4', () => {
    const reached = closure(4, [digitsOf(4), [1, 1, 1, 1]], [gate('add', 4), gate('mul', 4)])
    expect(reached.size).toBe(64)
  })

  it('field arithmetic reaches all 27 one-input functions at radix 3', () => {
    const reached = closure(3, [digitsOf(3), [1, 1, 1]], [gate('add', 3), gate('mul', 3)])
    expect(reached.size).toBe(27)
  })

  it('pure Kleene logic cannot make the constant 1 at radix 3', () => {
    const not = gate('not', 3)
    const withNot: Binary = (x) => not(x)
    const reached = closure(3, [digitsOf(3)], [gate('and', 3), gate('or', 3), withNot])
    expect(reached.has('1,1,1')).toBe(false)
    // The reason: it can never leave {0, 2} when its input is 0 or 2.
    for (const key of reached) {
      const f = key.split(',').map(Number)
      expect([0, 2]).toContain(f[0])
      expect([0, 2]).toContain(f[2])
    }
    expect(reached.size).toBeLessThan(27)
  })
})
