# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## 2026-10-07 — Step 1: GET /api/capacity

- **Data shape:** each logical assignment is stored as 15 rows whose `hours_per_day` add up to 2/4/6/8h. Rows must be summed; de-duplicating them gives nonsense.
- **Weekdays only (Mon–Fri).** Spans regularly run through Sat/Sun. Counting every day puts Ana's week of 29 Dec at 56/40 instead of 40/40, and over-capacity cells go from 1,626 to 4,779. A 40h week is a 5-day week, so weekends contribute 0. There are no holidays in the data (1 Jan counts as a working day); deferred.
- **Weeks are Mon–Sun, keyed by Monday's date.** `from`/`to` are inclusive and snapped outward to whole weeks, so every column is a complete week and capacity never needs prorating. Weeks use `date_trunc('week')`, not week numbers, so 29 Dec 2025 (ISO week 1 of 2026) is safe.
- **Response:** `weeks[]` plus one row per person `{id, name, weeklyHours, allocated[]}`, with `allocated` aligned by index to `weeks`. Capacity is `weeklyHours` for every week (there's no history table), so it's sent once per person. That means an edit changes one field and the client can patch it without recomputing cells.
- **Every person × every week is returned**, including zeros (LEFT JOIN against weeks), so the grid never has to guess at gaps.
- **Range capped at 53 weeks** (400 above that). Production has thousands of people × 2 years, and one unbounded response doesn't scale. Deferred: paginating/virtualising people.
- **Perf:** collapsing the split rows by (person, clipped span) before expanding into days took a 52-week query from ~0.6s to ~0.1–0.2s (EXPLAIN showed the 560k-row day expansion dominating).
- **Verified:** diffed every cell of two 52-week ranges plus the new-year week against an independent Python calculation from seed.sql: 0 mismatches. Spot checks: Ana 40/0/30, Bo 0/32/8, Dee 0/45/40 (overlapping projects), Eli 0/20/0 against 0 capacity.
- **Correction:** I first thought two people shared the name 田中 陽子. That was a false positive from macOS `sort | uniq -d` collation; a byte-exact check finds no duplicates. Rows are still keyed by id.

## 2026-10-07 — Step 2: PATCH /api/people/{id}

- Body `{"weeklyHours": n}`, accepting 0–168 with fractions allowed (37.5 is a real contract). Returns the stored person `{id, name, weeklyHours}`, which is the confirmed value the grid uses after an optimistic edit. It doesn't return the capacity grid: allocations don't depend on weekly_hours, so the client only needs this one number.
- 400 for a malformed body, unknown fields, or a bad id. 422 for an out-of-range value. 404 for an unknown person. These let the UI tell "you typed something wrong" apart from "the save failed".
- 0 is allowed (Eli is seeded at 0, e.g. someone on leave).
- Editing changes capacity for **every** week, past ones included, because there's no effective-date history in the schema. Noted, not solved.
- Concurrent edits are last-write-wins; there's no version/ETag. Deferred.
- Verified with curl: success path, all error paths, and the capacity endpoint reflecting the change. Reset Cem back to 20 afterwards.

## 2026-10-07 — Step 3: range state, navigation, URL

- **The range lives in the URL** (`?from=&to=`) and is owned by `App`, using pushState plus popstate. Reload, share-a-link and browser back all work. Invalid or missing params fall back to the default.
- **Default range kept as the scaffold's** (29 Dec 2025 – 18 Jan 2026), not "this week". The hand-written sample people (Ana, Bo, Cem, Dee, Eli) live there, and the seed ends in Jan 2027, so a "today" default stops being useful soon. A "This week" button covers the manager's real use.
- **Ranges are always whole Mon–Sun weeks**, the same rule as the API. ←/→ shift by one week and keep the length. Editing one end only moves the other end when the range would otherwise invert or exceed 53 weeks.
- **Date maths is done on 'YYYY-MM-DD' strings in UTC**, so the viewer's timezone can't shift a week boundary. "Today" is the exception: it's deliberately the viewer's local date.
- **Date labels are pinned to en-GB.** Using the browser locale produced Ukrainian month names next to English UI text in my browser.
- **Verified in a browser:** arrows, back button, This week (7 Oct → week of 5 Oct), mid-week dates snapping, inverted range, >53 weeks, cleared input, and a garbage URL. Unit tests in `dates.test.ts` cover the same rules plus the new-year week.

## 2026-10-07 — Step 4: the grid, loading and errors

- **Reading a cell:** it shows hours booked. Over capacity gets a red tint and bold text plus a "+N" marker, so it doesn't rely on colour alone. Exactly full gets a light tint. Under capacity gets a thin meter along the bottom. 0 shows "–". Anything booked against 0 capacity (Eli) counts as over; the percentage tooltip is skipped because there's no ratio.
- **Capacity shows once per row** ("Hours / week" column), not in every cell. It's constant per row, and this column becomes the edit control in step 5.
- **Loading:** first load shows skeleton rows. Changing the range keeps the previous grid, dimmed after 200ms so fast loads don't flicker, with "Loading…" in the summary. The old range's own `weeks` drive the headers, so a stale grid is never mislabelled. The request in flight is aborted when the range changes.
- **Fetch errors replace the grid** with the message and a Try again button, rather than keeping the old range visible under the new range's label.
- **Error wording:** first version said "The server responded with 502" (the Vite proxy's answer when the API is down). Now 502/503/504 read as "couldn't reach the server" and other 5xx as a generic server error. Only 4xx validation messages from the API are shown verbatim, because the API's 5xx bodies are internal labels.
- **Filters:** name search (works with accents, e.g. "sofía") and "Only over capacity", plus a count of people over capacity in the range. Cross-checked against the API: 41 people over for the default range.
- **Perf, deferred:** 53 weeks × 500 people = 26.5k cells, and a week step takes ~0.9s including the fetch. Fine for the seed, but at thousands of people the grid needs row virtualisation (and probably server-side paging). Not done.
- **Verified in a browser:** numbers vs the API, the stale/aria-busy state during navigation, the error state with the api container stopped, Retry after restarting it, and dark mode.

## 2026-10-07 — Step 5: editing weekly hours

- **Optimistic, with rollback.** The new value shows at once and every cell in the row reflects it. Success replaces it with the server's value plus a "Saved" note that fades. Failure reverts to the last good value and shows "N h not saved. <reason>" with Retry and dismiss. The alternative, waiting for the server, would make every edit feel slow for the rare failure; the failed state is explicit enough that nobody is misled.
- **No refetch after saving.** Allocations don't depend on weekly_hours, and capacity per week is just weekly_hours, so the PATCH response is the only number that changes. A refetch would cost a full range query per keystroke-save and still race.
- **Edits are an overlay (`edits.ts`), not written into the fetched data.** Each fetch records when it was *requested*, and each confirmed save records when it was *confirmed*. A confirmed edit overrides only data requested before it, and newer server data wins. This closes the "range fetch in flight while a save lands" hole. Proven in the browser: held a range response for 8s after the server answered with Ana=40, saved 30 meanwhile, and Ana stayed 30 when the stale response arrived.
- **Out-of-order saves for one person:** each save carries a sequence number. Only the newest save clears the pending state or reports failure. An older save's success still records the confirmed value, so a rollback goes to the true last-saved value. The server itself is last-write-wins (deferred: ETag/version).
- **Editor:** click the hours to edit. Enter saves, Escape cancels, blur saves (or discards invalid input). Client-side validation matches the API (0–168, comma allowed as a decimal separator), so bad input never makes a request. Focus returns to the button after Enter/Escape.
- **Bug caught in the browser:** pressing Enter saved, moved focus to the button, and the same keypress then "clicked" it, reopening the editor. Fixed with preventDefault on Enter.
- **Layout fix:** "Saved" used to sit on its own line, and after fading it still took up space, leaving that row taller. Status now sits inline next to the number; only the failure message wraps below.
- **Known gap:** with "Only over capacity" on, a person you just fixed drops out of the list mid-edit. Arguably correct, but jarring. Not addressed.
- Restored Ana (40) and Cem (20) in the DB after manual testing.

## 2026-10-07 — Step 6: tests

- 31 Vitest tests, aimed at the parts I'd be nervous to change rather than at coverage:
  - `edits.test.ts`: the overlay reducer. Rollback target, out-of-order successes and failures, and stale-fetch vs fresh-fetch precedence.
  - `capacity.test.ts`: cell classification, including 0 capacity and float drift.
  - `dates.test.ts`: week snapping, the new-year week, range limits.
  - `CapacityGrid.test.tsx`: one component test against a mocked fetch covering edit → optimistic → server 500 → rollback with message → Retry → applied, plus "invalid input is never sent" and the load-error retry.
- **Mutation-checked:** removing the requestedAt comparison or the stale-sequence guard each fails a test.
- **Not covered by tests:** the Enter-reopens-editor bug from step 5. jsdom's fireEvent doesn't run the browser's default key activation, so a test there would pass with or without the fix; it was verified in a real browser only. There are no Go tests either: the API was verified by diffing every cell against an independent calculation from seed.sql (see step 1), and that script isn't in the repo.

## 2026-10-07 — Step 7: final look

- **Data pattern, left as-is:** every third week the whole team has 0h booked (16 Jun, 7 Jul … 12 Oct, 2 Nov, 14 Dec). Bulk assignments start every 21 days and last ≤14 days, so it's a property of how the seed was generated, not a query bug (the API matched an independent calculation cell for cell). A real manager would ask about it; the grid shows it honestly as a column of "–".
- **Other data notes:** the peak is 45h (Dee, overlapping projects). The worst ratio is 40h against 20h capacity. Every weekly sum is a whole number once the split rows are added up.
- **Sort order is Postgres en_US.utf8 collation:** Latin names first, then Greek, Cyrillic, Hebrew, Arabic, CJK and Korean. Acceptable; a locale-aware client-side sort would be a later choice.
- **Narrow screens:** the 12rem name column plus page padding left no room for weeks on a phone. Tightened under 640px; weeks scroll sideways inside the grid and the page never scrolls horizontally.
- **Checked:** DB weekly_hours match the seed for all 500 people after manual testing. tsc is clean and 31/31 tests pass.

### Left unfinished / would do next
- Row virtualisation and server paging for thousands of people (26.5k cells at 53 weeks is ~0.9s per step today).
- weekly_hours has no history: an edit rewrites capacity for past weeks too. Needs effective-dated capacity.
- No holidays or time off: 1 Jan counts as a working day.
- Last-write-wins on concurrent edits; no ETag/version check.
- "Only over capacity" drops a row the moment an edit fixes it.
- No Go tests; the API correctness check was a one-off script.
