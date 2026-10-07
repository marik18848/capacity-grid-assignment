import { useCallback, useEffect, useState } from 'react'
import { ApiError, type CapacityData, fetchCapacity } from './api'

type State = {
  /** The last range that loaded. Kept while a new range loads, so the grid
   * doesn't blank out on every week step. */
  data: CapacityData | null
  /** performance.now() when `data` was requested; edits confirmed later win. */
  requestedAt: number
  loading: boolean
  error: ApiError | null
}

// useCapacity loads one range. Changing the range aborts the request in
// flight, so a slow response for an old range can never land on top of a
// newer one.
export function useCapacity(from: string, to: string) {
  const [state, setState] = useState<State>({ data: null, requestedAt: 0, loading: true, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const requestedAt = performance.now()
    setState((s) => ({ ...s, loading: true, error: null }))

    fetchCapacity({ from, to }, controller.signal).then(
      (data) => setState({ data, requestedAt, loading: false, error: null }),
      (err: unknown) => {
        if (controller.signal.aborted) return
        const error = err instanceof ApiError ? err : new ApiError('Something went wrong loading capacity.', 0)
        setState((s) => ({ ...s, loading: false, error }))
      },
    )

    return () => controller.abort()
  }, [from, to, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...state, retry }
}
