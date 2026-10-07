// Weekly-hours edits, kept as an overlay on top of whatever range was last
// fetched rather than written into it.
//
// Why an overlay: allocations don't depend on weekly hours, so the one number
// is all an edit changes — no refetch needed. But a range request can be in
// flight while a save lands, and its response would carry the old value.
// Recording *when* a save was confirmed lets us tell stale data (requested
// before the save) from fresh data (requested after, which wins).

export type PersonEdit = {
  /** Sequence of the newest save started for this person. */
  latestSeq: number
  /** Value being saved right now, shown optimistically. */
  pending: number | null
  /** Newest value the server has confirmed, and when (performance.now()). */
  confirmed: { value: number; seq: number; at: number } | null
  /** The newest save failed; the display has rolled back. */
  failed: { value: number; message: string } | null
}

export type Edits = Readonly<Record<number, PersonEdit>>

export type EditAction =
  | { type: 'start'; id: number; seq: number; value: number }
  | { type: 'success'; id: number; seq: number; value: number; at: number }
  | { type: 'failure'; id: number; seq: number; value: number; message: string }
  | { type: 'dismiss'; id: number }

const NO_EDIT: PersonEdit = { latestSeq: 0, pending: null, confirmed: null, failed: null }

export function editsReducer(state: Edits, action: EditAction): Edits {
  const edit = state[action.id] ?? NO_EDIT

  switch (action.type) {
    case 'start':
      return { ...state, [action.id]: { ...edit, latestSeq: action.seq, pending: action.value, failed: null } }

    case 'success': {
      // An older save can still land after a newer one started: it's the
      // newest *confirmed* value, but it mustn't clear the newer pending one.
      const confirmed =
        !edit.confirmed || action.seq > edit.confirmed.seq
          ? { value: action.value, seq: action.seq, at: action.at }
          : edit.confirmed
      const isLatest = action.seq === edit.latestSeq
      return {
        ...state,
        [action.id]: { ...edit, confirmed, pending: isLatest ? null : edit.pending, failed: isLatest ? null : edit.failed },
      }
    }

    case 'failure':
      // A newer save supersedes this one; its own outcome will decide.
      if (action.seq !== edit.latestSeq) return state
      return {
        ...state,
        [action.id]: { ...edit, pending: null, failed: { value: action.value, message: action.message } },
      }

    case 'dismiss':
      return { ...state, [action.id]: { ...edit, failed: null } }
  }
}

/**
 * The weekly hours to show for a person: the value being saved, else a
 * confirmed edit the fetched data predates, else the fetched value.
 */
export function effectiveHours(fetched: number, edit: PersonEdit | undefined, requestedAt: number): number {
  if (!edit) return fetched
  if (edit.pending !== null) return edit.pending
  if (edit.confirmed && edit.confirmed.at > requestedAt) return edit.confirmed.value
  return fetched
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

export function saveStatus(edit: PersonEdit | undefined): SaveStatus {
  if (!edit) return 'idle'
  if (edit.pending !== null) return 'saving'
  if (edit.failed) return 'failed'
  if (edit.confirmed) return 'saved'
  return 'idle'
}

export const MAX_WEEKLY_HOURS = 168

/** Parses the editor's text; returns the hours, or a message to show. */
export function parseWeeklyHours(text: string): number | string {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return 'Enter a number of hours.'
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return 'Enter a number of hours.'
  if (n < 0 || n > MAX_WEEKLY_HOURS) return `Hours must be between 0 and ${MAX_WEEKLY_HOURS}.`
  return n
}
