import { describe, expect, it } from 'vitest'
import { type EditAction, type Edits, editsReducer, effectiveHours, parseWeeklyHours, saveStatus } from './edits'

const ANA = 1

function run(...actions: EditAction[]): Edits {
  return actions.reduce(editsReducer, {} as Edits)
}

describe('saving weekly hours', () => {
  it('shows the pending value, then the confirmed one', () => {
    const pending = run({ type: 'start', id: ANA, seq: 1, value: 32 })
    expect(effectiveHours(40, pending[ANA], 0)).toBe(32)
    expect(saveStatus(pending[ANA])).toBe('saving')

    const saved = editsReducer(pending, { type: 'success', id: ANA, seq: 1, value: 32, at: 10 })
    expect(effectiveHours(40, saved[ANA], 0)).toBe(32)
    expect(saveStatus(saved[ANA])).toBe('saved')
  })

  it('rolls back to the last saved value when a save fails', () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'success', id: ANA, seq: 1, value: 32, at: 10 },
      { type: 'start', id: ANA, seq: 2, value: 20 },
      { type: 'failure', id: ANA, seq: 2, value: 20, message: 'offline' },
    )
    expect(effectiveHours(40, state[ANA], 0)).toBe(32)
    expect(saveStatus(state[ANA])).toBe('failed')
    expect(state[ANA].failed).toEqual({ value: 20, message: 'offline' })
  })

  it('rolls back to the fetched value when nothing was ever saved', () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'failure', id: ANA, seq: 1, value: 32, message: 'offline' },
    )
    expect(effectiveHours(40, state[ANA], 0)).toBe(40)
  })

  it('a retry clears the failure while it saves', () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'failure', id: ANA, seq: 1, value: 32, message: 'offline' },
      { type: 'start', id: ANA, seq: 2, value: 32 },
    )
    expect(saveStatus(state[ANA])).toBe('saving')
    expect(state[ANA].failed).toBeNull()
  })

  it('leaves other people alone', () => {
    const state = run({ type: 'start', id: ANA, seq: 1, value: 32 })
    expect(state[2]).toBeUndefined()
    expect(effectiveHours(24, state[2], 0)).toBe(24)
  })
})

describe('out-of-order responses', () => {
  it("an older save's success doesn't clear a newer pending value", () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'start', id: ANA, seq: 2, value: 36 },
      { type: 'success', id: ANA, seq: 1, value: 32, at: 10 },
    )
    expect(effectiveHours(40, state[ANA], 0)).toBe(36)
    expect(saveStatus(state[ANA])).toBe('saving')
  })

  it("an older save's failure is ignored while a newer one is in flight", () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'start', id: ANA, seq: 2, value: 36 },
      { type: 'failure', id: ANA, seq: 1, value: 32, message: 'offline' },
    )
    expect(saveStatus(state[ANA])).toBe('saving')
    expect(state[ANA].failed).toBeNull()
  })

  it('a newer save confirmed first is not overwritten by an older one confirming later', () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'start', id: ANA, seq: 2, value: 36 },
      { type: 'success', id: ANA, seq: 2, value: 36, at: 10 },
      { type: 'success', id: ANA, seq: 1, value: 32, at: 11 },
    )
    expect(effectiveHours(40, state[ANA], 0)).toBe(36)
  })

  it('rolls back to an older confirmed save when the newer one fails', () => {
    const state = run(
      { type: 'start', id: ANA, seq: 1, value: 32 },
      { type: 'start', id: ANA, seq: 2, value: 36 },
      { type: 'success', id: ANA, seq: 1, value: 32, at: 10 },
      { type: 'failure', id: ANA, seq: 2, value: 36, message: 'offline' },
    )
    expect(effectiveHours(40, state[ANA], 0)).toBe(32)
  })
})

describe('edits against fetched ranges', () => {
  const saved = run(
    { type: 'start', id: ANA, seq: 1, value: 32 },
    { type: 'success', id: ANA, seq: 1, value: 32, at: 100 },
  )

  it('overrides data requested before the save was confirmed', () => {
    // e.g. the manager stepped a week, then saved before that range arrived
    expect(effectiveHours(40, saved[ANA], 99)).toBe(32)
  })

  it('defers to data requested after the save was confirmed', () => {
    // fresher than the edit, e.g. someone else has changed it since
    expect(effectiveHours(24, saved[ANA], 101)).toBe(24)
  })
})

describe('parseWeeklyHours', () => {
  it('accepts hours in range, including fractions and a decimal comma', () => {
    expect(parseWeeklyHours('32')).toBe(32)
    expect(parseWeeklyHours(' 37.5 ')).toBe(37.5)
    expect(parseWeeklyHours('37,5')).toBe(37.5)
    expect(parseWeeklyHours('0')).toBe(0)
    expect(parseWeeklyHours('168')).toBe(168)
  })

  it('returns a message for anything else', () => {
    for (const bad of ['', '  ', 'abc', '-1', '168.5', 'Infinity']) {
      expect(typeof parseWeeklyHours(bad)).toBe('string')
    }
  })
})
