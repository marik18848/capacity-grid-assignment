import { useCallback, useEffect, useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { RangeControls } from './RangeControls'
import { type Range, normalizeRange, rangeFromSearch, rangeToSearch } from './dates'

// Where the grid opens when the URL doesn't say otherwise.
const DEFAULT_RANGE = normalizeRange('2025-12-29', '2026-01-16')

function rangeFromLocation(): Range {
  return rangeFromSearch(window.location.search) ?? DEFAULT_RANGE
}

// The range lives in the URL so a view can be linked to, reloaded, and
// stepped through with the browser's back button.
export function App() {
  const [range, setRangeState] = useState(rangeFromLocation)

  useEffect(() => {
    const onPopState = () => setRangeState(rangeFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setRange = useCallback((next: Range) => {
    setRangeState(next)
    const search = rangeToSearch(next)
    if (search !== window.location.search) window.history.pushState(null, '', search)
  }, [])

  return (
    <main>
      <h1>Team capacity</h1>
      <RangeControls range={range} onChange={setRange} />
      <CapacityGrid from={range.from} to={range.to} />
    </main>
  )
}
