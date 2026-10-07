# Decisions

Yours to write, not your AI's. Short is good — bullets are fine, and half a page is
plenty. We read this first.

## What did the spec not tell you?

Weekend handling was the biggest gap. Assignments run through Saturday and Sunday, which pushed full-time loads to 56 hours if every day was counted. I restricted calculations to Monday through Friday so standard workloads line up at 40 hours. The brief also left mid-week date boundaries undefined, so I snapped any selected range to full Monday–Sunday weeks and capped queries at 53 weeks to prevent oversized payloads. When saving a user's hours, the UI updates optimistically without refetching the entire grid, rolling back with a retry prompt on failure. To prevent an in-flight week navigation from resolving late and overwriting a fresh save with stale data, each save records a confirmation timestamp so only newer requests can overwrite that state. Lastly, someone with 0 capacity but booked work counts as over capacity, and because the schema lacks effective-date versioning, updating hours modifies past weeks too.

-

## What did you notice that looked wrong?

Assignments are split across 15 separate rows that sum up to the daily total, so they had to be aggregated rather than de-duplicated. Every third week shows zero hours team-wide; this turned out to be deliberate mock data behavior (assignments last up to 14 days and cycle every 21 days), not a query flaw. Dee also spikes to 45 hours in early January due to an intentional overlap across two projects.

-

## What did the AI get wrong that you caught?

In the inline hours editor, pressing Enter saved the value and then immediately reopened the editor. Saving swapped the input for a button and moved focus to it, and the browser's default action for that same Enter keypress then "clicked" the new button. It only showed up when I tried it in a real browser; the fix was preventing the default action on Enter.

-

## What would you do differently with a week?

I would implement DOM virtualization and server-side pagination to handle thousands of users smoothly. I would also add date versioning to weekly capacities to protect historical records, support holidays and time off, add conflict detection for concurrent edits instead of last-write-wins, and write Go integration tests for week-boundary aggregations.
-
