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
