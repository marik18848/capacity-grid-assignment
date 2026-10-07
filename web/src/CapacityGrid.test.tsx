import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapacityData } from './api'
import { CapacityGrid } from './CapacityGrid'

const RANGE: CapacityData = {
  from: '2025-12-29',
  to: '2026-01-11',
  weeks: ['2025-12-29', '2026-01-05'],
  people: [
    { id: 1, name: 'Ana Ferreira', weeklyHours: 40, allocated: [40, 0] },
    { id: 4, name: 'Dee Okafor', weeklyHours: 40, allocated: [0, 45] },
  ],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let patchResponses: Response[]
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method === 'PATCH') {
    const next = patchResponses.shift()
    if (!next) throw new Error('unexpected PATCH')
    return next
  }
  return json(RANGE)
})

beforeEach(() => {
  patchResponses = []
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// The count is split across elements ("<strong>1</strong> of 2 people…").
function summary() {
  return document.querySelector('.grid-summary')?.textContent
}

function anaRow() {
  return screen.getByText('Ana Ferreira').closest('tr')!
}

async function editAnaTo(value: string) {
  fireEvent.click(within(anaRow()).getByRole('button', { name: /weekly hours for ana/i }))
  const input = within(anaRow()).getByRole('spinbutton')
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('CapacityGrid editing', () => {
  it('rolls back a failed save, then applies it on retry', async () => {
    render(<CapacityGrid from="2025-12-29" to="2026-01-11" />)
    await screen.findByText('Ana Ferreira')
    expect(summary()).toMatch(/^1 of 2 people over capacity/)

    patchResponses.push(json({ error: 'update person' }, 500))
    await editAnaTo('32')

    // Optimistic: Ana's 40h week is over a 32h capacity straight away.
    expect(within(anaRow()).getByText('+8')).toBeInTheDocument()

    // Failure: back to 40, with the reason and a way to retry.
    const alert = await within(anaRow()).findByRole('alert')
    expect(alert).toHaveTextContent('32 h not saved')
    expect(alert).toHaveTextContent('Something went wrong on the server')
    expect(within(anaRow()).queryByText('+8')).not.toBeInTheDocument()
    expect(within(anaRow()).getByRole('button', { name: /weekly hours for ana/i })).toHaveTextContent('40')

    patchResponses.push(json({ id: 1, name: 'Ana Ferreira', weeklyHours: 32 }))
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await within(anaRow()).findByText('Saved')
    expect(within(anaRow()).getByText('+8')).toBeInTheDocument()
    expect(summary()).toMatch(/^2 of 2 people over capacity/)

    const patch = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(patch).toHaveLength(2)
    expect(patch[1]).toEqual(['/api/people/1', expect.objectContaining({ body: '{"weeklyHours":32}' })])
  })

  it('does not send invalid hours', async () => {
    render(<CapacityGrid from="2025-12-29" to="2026-01-11" />)
    await screen.findByText('Ana Ferreira')

    await editAnaTo('400')

    expect(within(anaRow()).getByRole('alert')).toHaveTextContent('between 0 and 168')
    expect(within(anaRow()).getByRole('spinbutton')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('shows a retryable error when the range fails to load', async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: 'query capacity' }, 500))
    render(<CapacityGrid from="2025-12-29" to="2026-01-11" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load capacity")
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByText('Ana Ferreira')).toBeInTheDocument())
  })
})
