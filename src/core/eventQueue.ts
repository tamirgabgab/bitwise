import type { Signal } from './signal.ts'

/**
 * A scheduled change of one output port, or, with `wake` set, the moment a
 * component asked to be evaluated again.
 */
export interface SimEvent {
  readonly time: number
  /**
   * Global scheduling order. It breaks ties between events at the same time
   * and lets the engine recognise an event that a newer one has overtaken.
   */
  readonly seq: number
  readonly component: number
  readonly port: string
  readonly value: Signal
  readonly wake?: boolean
}

function isBefore(a: SimEvent, b: SimEvent): boolean {
  return a.time < b.time || (a.time === b.time && a.seq < b.seq)
}

/** Min-heap of events, ordered by time and then by scheduling order. */
export class EventQueue {
  private readonly heap: SimEvent[] = []

  get size(): number {
    return this.heap.length
  }

  peek(): SimEvent | undefined {
    return this.heap[0]
  }

  clear(): void {
    this.heap.length = 0
  }

  push(event: SimEvent): void {
    const heap = this.heap
    let index = heap.length
    heap.push(event)
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (!isBefore(heap[index], heap[parent])) break
      ;[heap[index], heap[parent]] = [heap[parent], heap[index]]
      index = parent
    }
  }

  pop(): SimEvent | undefined {
    const heap = this.heap
    const top = heap[0]
    const last = heap.pop()
    if (last === undefined || heap.length === 0) return top
    heap[0] = last
    let index = 0
    for (;;) {
      const left = 2 * index + 1
      const right = left + 1
      let smallest = index
      if (left < heap.length && isBefore(heap[left], heap[smallest])) smallest = left
      if (right < heap.length && isBefore(heap[right], heap[smallest])) smallest = right
      if (smallest === index) break
      ;[heap[index], heap[smallest]] = [heap[smallest], heap[index]]
      index = smallest
    }
    return top
  }
}
