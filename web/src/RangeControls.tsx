import {
  type Range,
  addDays,
  isISODate,
  shiftRange,
  startOfWeek,
  todayISO,
  weekCount,
  withFrom,
  withTo,
} from './dates'

type Props = {
  range: Range
  onChange: (next: Range) => void
}

const label = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDate(iso: string): string {
  return label.format(new Date(`${iso}T00:00:00Z`))
}

// RangeControls moves the visible range a week at a time, jumps back to the
// current week, or sets either end directly. Ends snap to whole weeks.
export function RangeControls({ range, onChange }: Props) {
  const weeks = weekCount(range)

  function jumpToThisWeek() {
    const from = startOfWeek(todayISO())
    onChange({ from, to: addDays(from, weeks * 7 - 1) })
  }

  return (
    <div className="range-controls">
      <div className="range-nav" role="group" aria-label="Move range">
        <button type="button" onClick={() => onChange(shiftRange(range, -1))} aria-label="Previous week">
          ←
        </button>
        <button type="button" onClick={jumpToThisWeek}>
          This week
        </button>
        <button type="button" onClick={() => onChange(shiftRange(range, 1))} aria-label="Next week">
          →
        </button>
      </div>

      <label>
        From
        <input
          type="date"
          value={range.from}
          onChange={(e) => isISODate(e.target.value) && onChange(withFrom(range, e.target.value))}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={range.to}
          onChange={(e) => isISODate(e.target.value) && onChange(withTo(range, e.target.value))}
        />
      </label>

      <p className="range" aria-live="polite">
        {formatDate(range.from)} – {formatDate(range.to)} · {weeks} {weeks === 1 ? 'week' : 'weeks'}
      </p>
    </div>
  )
}
