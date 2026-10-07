// Date helpers for the capacity range. Dates are plain 'YYYY-MM-DD' strings
// and all arithmetic is done in UTC, so a manager's timezone can never shift
// a week boundary by a day.

/** A range of whole weeks: `from` is a Monday, `to` is a Sunday. */
export type Range = { from: string; to: string }

/** Matches the API's limit; a longer range is a 400. */
export const MAX_WEEKS = 53

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  // Rejects dates like 2026-02-30, which Date silently rolls over.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function startOfWeek(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(iso, -((day + 6) % 7))
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6)
}

export function weekCount({ from, to }: Range): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  return Math.round((days + 1) / 7)
}

/** Today in the viewer's own timezone — "this week" is the manager's week. */
export function todayISO(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

/** Snaps outward to whole weeks; a reversed range collapses to from's week. */
export function normalizeRange(from: string, to: string): Range {
  const start = startOfWeek(from)
  const end = to < start ? endOfWeek(start) : endOfWeek(to)
  const r = { from: start, to: end }
  return weekCount(r) > MAX_WEEKS ? { from: start, to: addDays(start, MAX_WEEKS * 7 - 1) } : r
}

export function shiftRange(r: Range, weeks: number): Range {
  return { from: addDays(r.from, weeks * 7), to: addDays(r.to, weeks * 7) }
}

/** Moves the start; the end follows only if it would otherwise be invalid. */
export function withFrom(r: Range, from: string): Range {
  const start = startOfWeek(from)
  let end = r.to < start ? endOfWeek(start) : r.to
  if (weekCount({ from: start, to: end }) > MAX_WEEKS) end = addDays(start, MAX_WEEKS * 7 - 1)
  return { from: start, to: end }
}

/** Moves the end; the start follows only if it would otherwise be invalid. */
export function withTo(r: Range, to: string): Range {
  const end = endOfWeek(to)
  let start = r.from > end ? startOfWeek(end) : r.from
  if (weekCount({ from: start, to: end }) > MAX_WEEKS) start = addDays(end, -(MAX_WEEKS * 7 - 1))
  return { from: start, to: end }
}

/** Reads ?from=&to= from a URL search string; null if absent or invalid. */
export function rangeFromSearch(search: string): Range | null {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  const to = params.get('to')
  if (!from || !to || !isISODate(from) || !isISODate(to)) return null
  return normalizeRange(from, to)
}

export function rangeToSearch(r: Range): string {
  return `?${new URLSearchParams({ from: r.from, to: r.to })}`
}
