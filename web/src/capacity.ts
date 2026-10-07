// Pure rules for reading a capacity cell, kept out of the component so they
// can be tested and reused by the rest of the overview page.

/** none: nothing booked · under: room left · full: exactly at capacity · over: booked past it */
export type Load = 'none' | 'under' | 'full' | 'over'

// Hours arrive as sums of fractional rows; compare with a little slack.
const EPSILON = 1e-6

export function loadOf(allocated: number, capacity: number): Load {
  if (allocated > capacity + EPSILON) return 'over' // includes anything booked against 0 capacity
  if (allocated <= EPSILON) return 'none'
  if (allocated >= capacity - EPSILON) return 'full'
  return 'under'
}

/** Share of capacity used, 0..1+, or null when capacity is 0 (no meaningful ratio). */
export function utilisation(allocated: number, capacity: number): number | null {
  return capacity > 0 ? allocated / capacity : null
}

const hours = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })

export function formatHours(n: number): string {
  return hours.format(n)
}

export function weeksOver(allocated: number[], capacity: number): number {
  return allocated.filter((a) => loadOf(a, capacity) === 'over').length
}
