import { describe, expect, it } from 'vitest'
import {
  MAX_WEEKS,
  isISODate,
  normalizeRange,
  rangeFromSearch,
  shiftRange,
  startOfWeek,
  todayISO,
  weekCount,
  withFrom,
  withTo,
} from './dates'

describe('week boundaries', () => {
  it('snaps every day of a week to its Monday', () => {
    for (const day of ['2025-12-29', '2025-12-31', '2026-01-01', '2026-01-04']) {
      expect(startOfWeek(day)).toBe('2025-12-29')
    }
    expect(startOfWeek('2026-01-05')).toBe('2026-01-05')
  })

  it('normalizes the default range across the new year to whole weeks', () => {
    const r = normalizeRange('2025-12-29', '2026-01-16')
    expect(r).toEqual({ from: '2025-12-29', to: '2026-01-18' })
    expect(weekCount(r)).toBe(3)
  })

  it('collapses a reversed range to a single week', () => {
    expect(normalizeRange('2026-01-14', '2026-01-01')).toEqual({ from: '2026-01-12', to: '2026-01-18' })
  })

  it('caps a range at the API limit', () => {
    expect(weekCount(normalizeRange('2025-01-01', '2027-01-01'))).toBe(MAX_WEEKS)
  })
})

describe('moving the range', () => {
  const r = { from: '2025-12-29', to: '2026-01-18' }

  it('shifts both ends by whole weeks and keeps the length', () => {
    expect(shiftRange(r, 1)).toEqual({ from: '2026-01-05', to: '2026-01-25' })
    expect(shiftRange(r, -1)).toEqual({ from: '2025-12-22', to: '2026-01-11' })
  })

  it('moves only the end being edited unless the range would invert', () => {
    expect(withFrom(r, '2026-01-07')).toEqual({ from: '2026-01-05', to: '2026-01-18' })
    expect(withFrom(r, '2026-02-04')).toEqual({ from: '2026-02-02', to: '2026-02-08' })
    expect(withTo(r, '2026-02-04')).toEqual({ from: '2025-12-29', to: '2026-02-08' })
    expect(withTo(r, '2025-12-01')).toEqual({ from: '2025-12-01', to: '2025-12-07' })
  })

  it('keeps an edited range within the limit by moving the other end', () => {
    const wide = withTo(r, '2027-06-01')
    expect(wide.to).toBe('2027-06-06')
    expect(weekCount(wide)).toBe(MAX_WEEKS)
  })
})

describe('URL and input parsing', () => {
  it('rejects dates that do not exist', () => {
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-2-3')).toBe(false)
    expect(isISODate('2026-02-28')).toBe(true)
  })

  it('reads a range from the query string, or nothing', () => {
    expect(rangeFromSearch('?from=2026-01-07&to=2026-01-08')).toEqual({ from: '2026-01-05', to: '2026-01-11' })
    expect(rangeFromSearch('?from=2026-01-07')).toBeNull()
    expect(rangeFromSearch('?from=garbage&to=2026-01-08')).toBeNull()
  })

  it("uses the viewer's local date for today", () => {
    expect(todayISO(new Date(2026, 0, 4, 23, 30))).toBe('2026-01-04')
  })
})
