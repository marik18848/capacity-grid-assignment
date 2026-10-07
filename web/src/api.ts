import { type Range, rangeToSearch } from './dates'

/** One row of GET /api/capacity. `allocated[i]` belongs to `weeks[i]`. */
export type PersonCapacity = {
  id: number
  name: string
  weeklyHours: number
  allocated: number[]
}

export type CapacityData = {
  from: string
  to: string
  weeks: string[]
  people: PersonCapacity[]
}

/** PATCH /api/people/{id} responds with the person as stored. */
export type Person = {
  id: number
  name: string
  weeklyHours: number
}

/** `status` is 0 when the server could not be reached at all. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (isAbortError(err)) throw err
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0)
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", res.status)
  }
  if (res.status >= 500) {
    // The API's 5xx bodies are internal labels, not something to show a manager.
    throw new ApiError('Something went wrong on the server. Try again in a moment.', res.status)
  }
  if (!res.ok) {
    let message = `The request was rejected (${res.status}).`
    try {
      const body: unknown = await res.json()
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        message = body.error
      }
    } catch {
      // Not JSON (e.g. a proxy error page); keep the generic message.
    }
    throw new ApiError(message, res.status)
  }

  return (await res.json()) as T
}

export function fetchCapacity(range: Range, signal?: AbortSignal): Promise<CapacityData> {
  return request<CapacityData>(`/api/capacity${rangeToSearch(range)}`, { signal })
}

export function updateWeeklyHours(id: number, weeklyHours: number): Promise<Person> {
  return request<Person>(`/api/people/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyHours }),
  })
}
