import { describe, expect, it } from 'vitest'
import { EventQueue } from './eventQueue.ts'
import type { SimEvent } from './eventQueue.ts'

function event(time: number, seq: number): SimEvent {
  return { time, seq, component: 1, port: 'out', value: [] }
}

function drain(queue: EventQueue): [number, number][] {
  const order: [number, number][] = []
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    order.push([next.time, next.seq])
  }
  return order
}

describe('EventQueue', () => {
  it('is empty at first', () => {
    const queue = new EventQueue()
    expect(queue.size).toBe(0)
    expect(queue.peek()).toBeUndefined()
    expect(queue.pop()).toBeUndefined()
  })

  it('pops events in time order whatever the push order', () => {
    const queue = new EventQueue()
    const times = [5, 1, 9, 3, 7, 2, 8, 4, 6, 0]
    times.forEach((time, index) => queue.push(event(time, index)))
    expect(drain(queue).map(([time]) => time)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('keeps scheduling order among events at the same time', () => {
    const queue = new EventQueue()
    queue.push(event(4, 3))
    queue.push(event(4, 1))
    queue.push(event(2, 5))
    queue.push(event(4, 2))
    expect(drain(queue)).toEqual([
      [2, 5],
      [4, 1],
      [4, 2],
      [4, 3],
    ])
  })

  it('peeks without removing', () => {
    const queue = new EventQueue()
    queue.push(event(3, 1))
    queue.push(event(1, 2))
    expect(queue.peek()?.time).toBe(1)
    expect(queue.size).toBe(2)
  })
})
