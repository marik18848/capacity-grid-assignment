import { type CSSProperties, memo, useDeferredValue, useMemo, useState } from 'react'
import type { PersonCapacity } from './api'
import { formatHours, loadOf, utilisation, weeksOver } from './capacity'
import { startOfWeek, todayISO } from './dates'
import { type PersonEdit, effectiveHours } from './edits'
import { HoursEditor } from './HoursEditor'
import { useCapacity } from './useCapacity'
import { useWeeklyHoursEdits } from './useWeeklyHoursEdits'

type Props = {
  from: string
  to: string
}

const weekLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekTitle = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

// CapacityGrid renders one row per person and one column per week. Each cell
// is the hours booked that week; cells past the person's weekly hours are
// flagged in colour and with a +N marker, so over-allocation reads without
// relying on colour alone.
export function CapacityGrid({ from, to }: Props) {
  const { data, requestedAt, loading, error, retry } = useCapacity(from, to)
  const { edits, save, dismiss } = useWeeklyHoursEdits()
  const [query, setQuery] = useState('')
  const [onlyOver, setOnlyOver] = useState(false)
  const deferredQuery = useDeferredValue(query)

  // Rows nobody edited keep their identity, so memoised rows skip re-rendering.
  const people = useMemo(
    () =>
      (data?.people ?? []).map((p) => {
        const weeklyHours = effectiveHours(p.weeklyHours, edits[p.id], requestedAt)
        return weeklyHours === p.weeklyHours ? p : { ...p, weeklyHours }
      }),
    [data, edits, requestedAt],
  )
  const overCount = useMemo(() => people.filter((p) => weeksOver(p.allocated, p.weeklyHours) > 0).length, [people])
  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase()
    return people.filter(
      (p) =>
        (!q || p.name.toLocaleLowerCase().includes(q)) && (!onlyOver || weeksOver(p.allocated, p.weeklyHours) > 0),
    )
  }, [people, deferredQuery, onlyOver])

  if (error) {
    return (
      <div className="grid-message grid-error" role="alert">
        <p>
          <strong>Couldn't load capacity.</strong> {error.message}
        </p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </div>
    )
  }

  if (!data) return <GridSkeleton />

  const currentWeek = startOfWeek(todayISO())

  return (
    <section className="capacity" aria-busy={loading}>
      <div className="grid-toolbar">
        <input
          type="search"
          placeholder="Filter by name"
          aria-label="Filter people by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} />
          Only over capacity
        </label>
        <p className="grid-summary" aria-live="polite">
          {loading ? (
            'Loading…'
          ) : (
            <>
              <strong>{overCount}</strong> of {people.length} people over capacity in at least one week
            </>
          )}
        </p>
      </div>

      <div className={`grid-scroll${loading ? ' is-stale' : ''}`}>
        <table className="grid">
          <thead>
            <tr>
              <th scope="col" className="col-person">
                Person
              </th>
              <th scope="col" className="col-capacity">
                Hours / week
              </th>
              {data.weeks.map((w) => (
                <th
                  key={w}
                  scope="col"
                  className={w === currentWeek ? 'col-week is-current' : 'col-week'}
                  title={`Week of ${weekTitle.format(utc(w))}`}
                >
                  {weekLabel.format(utc(w))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <Row key={p.id} person={p} edit={edits[p.id]} onSave={save} onDismiss={dismiss} />
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="grid-message">
            {people.length === 0 ? 'No people to show.' : 'Nobody matches these filters.'}
          </p>
        )}
      </div>
    </section>
  )
}

type RowProps = {
  person: PersonCapacity
  edit: PersonEdit | undefined
  onSave: (id: number, weeklyHours: number) => void
  onDismiss: (id: number) => void
}

const Row = memo(function Row({ person, edit, onSave, onDismiss }: RowProps) {
  const capacity = person.weeklyHours
  return (
    <tr>
      <th scope="row" className="col-person">
        <span dir="auto">{person.name}</span>
      </th>
      <td className="col-capacity">
        <HoursEditor person={person} edit={edit} onSave={onSave} onDismiss={onDismiss} />
      </td>
      {person.allocated.map((allocated, i) => (
        <Cell key={i} allocated={allocated} capacity={capacity} />
      ))}
    </tr>
  )
})

function Cell({ allocated, capacity }: { allocated: number; capacity: number }) {
  const load = loadOf(allocated, capacity)
  const ratio = utilisation(allocated, capacity)
  const percent = ratio === null ? '' : ` (${Math.round(ratio * 100)}%)`
  const title = `${formatHours(allocated)} of ${formatHours(capacity)} h booked${percent}`

  return (
    <td
      className={`cell load-${load}`}
      title={title}
      style={{ '--fill': `${Math.min(ratio ?? 1, 1) * 100}%` } as CSSProperties}
    >
      {load === 'none' ? (
        <span aria-label="Nothing booked">–</span>
      ) : (
        <>
          {formatHours(allocated)}
          {load === 'over' && <span className="over-by">+{formatHours(allocated - capacity)}</span>}
        </>
      )}
    </td>
  )
}

function GridSkeleton() {
  return (
    <div className="grid-skeleton" aria-busy="true" aria-label="Loading capacity">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  )
}
