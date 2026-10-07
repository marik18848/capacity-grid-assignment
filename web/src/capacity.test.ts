import { describe, expect, it } from 'vitest'
import { loadOf, utilisation, weeksOver } from './capacity'

describe('loadOf', () => {
  it('classifies a week against capacity', () => {
    expect(loadOf(0, 40)).toBe('none')
    expect(loadOf(30, 40)).toBe('under')
    expect(loadOf(40, 40)).toBe('full')
    expect(loadOf(45, 40)).toBe('over')
  })

  it('treats anything booked against zero capacity as over', () => {
    expect(loadOf(20, 0)).toBe('over')
    expect(loadOf(0, 0)).toBe('none')
  })

  it('tolerates rounding from summed fractional rows', () => {
    // 0.1 + 0.2 style drift must not flip a full week to over
    expect(loadOf(40.0000000001, 40)).toBe('full')
  })
})

describe('utilisation', () => {
  it('has no ratio for zero capacity', () => {
    expect(utilisation(20, 0)).toBeNull()
    expect(utilisation(30, 40)).toBe(0.75)
  })
})

describe('weeksOver', () => {
  it('counts the weeks past capacity', () => {
    expect(weeksOver([40, 45, 0, 41], 40)).toBe(2)
  })
})
