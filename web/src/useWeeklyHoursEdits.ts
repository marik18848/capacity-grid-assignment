import { useCallback, useReducer, useRef } from 'react'
import { ApiError, updateWeeklyHours } from './api'
import { editsReducer } from './edits'

// useWeeklyHoursEdits saves weekly hours optimistically: the new value shows
// at once, is replaced by the server's value on success, and rolls back with
// a retryable error on failure. See edits.ts for how this stays correct
// against range fetches and out-of-order responses.
export function useWeeklyHoursEdits() {
  const [edits, dispatch] = useReducer(editsReducer, {})
  const seq = useRef(0)

  const save = useCallback(async (id: number, value: number) => {
    const s = ++seq.current
    dispatch({ type: 'start', id, seq: s, value })
    try {
      const person = await updateWeeklyHours(id, value)
      dispatch({ type: 'success', id, seq: s, value: person.weeklyHours, at: performance.now() })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong saving.'
      dispatch({ type: 'failure', id, seq: s, value, message })
    }
  }, [])

  const dismiss = useCallback((id: number) => dispatch({ type: 'dismiss', id }), [])

  return { edits, save, dismiss }
}
