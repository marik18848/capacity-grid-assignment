import { useRef, useState } from 'react'
import type { PersonCapacity } from './api'
import { formatHours } from './capacity'
import { MAX_WEEKLY_HOURS, type PersonEdit, parseWeeklyHours, saveStatus } from './edits'

type Props = {
  person: PersonCapacity
  edit: PersonEdit | undefined
  onSave: (id: number, weeklyHours: number) => void
  onDismiss: (id: number) => void
}

// HoursEditor is the "Hours / week" cell: a button showing the hours that
// turns into an input. Enter or leaving the field saves, Escape cancels.
// Invalid input is caught here and never sent.
export function HoursEditor({ person, edit, onSave, onDismiss }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const status = saveStatus(edit)
  const failed = edit?.failed
  // Enter and Escape hand focus back to the button; a blur means the manager
  // already moved on, so focus is left where they put it.
  const refocus = useRef(false)

  function close(keepFocus = false) {
    refocus.current = keepFocus
    setDraft(null)
    setProblem(null)
  }

  function commit(fromBlur: boolean) {
    if (draft === null) return
    const parsed = parseWeeklyHours(draft)
    if (typeof parsed === 'string') {
      // Leaving the field with bad input discards it; Enter keeps you there to fix it.
      if (fromBlur) close()
      else setProblem(parsed)
      return
    }
    close(!fromBlur)
    if (parsed !== person.weeklyHours) onSave(person.id, parsed)
  }

  if (draft !== null) {
    return (
      <span className="hours-editor">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={MAX_WEEKLY_HOURS}
          step="any"
          autoFocus
          value={draft}
          aria-label={`Weekly hours for ${person.name}`}
          aria-invalid={problem !== null}
          aria-describedby={problem ? `hours-problem-${person.id}` : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
            setProblem(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Otherwise the same keypress "clicks" the button that takes
              // focus next, and the editor reopens.
              e.preventDefault()
              commit(false)
            }
            if (e.key === 'Escape') close(true)
          }}
          onBlur={() => commit(true)}
        />
        {problem && (
          <span id={`hours-problem-${person.id}`} className="hours-problem" role="alert">
            {problem}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="hours">
      <span className="hours-line">
        {status === 'saving' && (
          <span className="hours-status is-saving" role="status">
            Saving…
          </span>
        )}
        {status === 'saved' && edit?.confirmed && (
          // Keyed by save, so each successful save replays the fade.
          <span key={edit.confirmed.seq} className="hours-status is-saved" role="status">
            Saved
          </span>
        )}
        <button
          ref={(el) => {
            if (el && refocus.current) {
              refocus.current = false
              el.focus()
            }
          }}
          type="button"
          className="hours-button"
          onClick={() => setDraft(String(person.weeklyHours))}
          aria-label={`Weekly hours for ${person.name}: ${formatHours(person.weeklyHours)}. Edit`}
        >
          {formatHours(person.weeklyHours)}
        </button>
      </span>
      {status === 'failed' && failed && (
        <span className="hours-status is-failed" role="alert">
          {formatHours(failed.value)} h not saved. {failed.message}
          <button type="button" onClick={() => onSave(person.id, failed.value)}>
            Retry
          </button>
          <button type="button" onClick={() => onDismiss(person.id)} aria-label="Dismiss">
            ×
          </button>
        </span>
      )}
    </span>
  )
}
