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
