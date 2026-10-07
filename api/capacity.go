package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

const (
	dateLayout = "2006-01-02"
	// maxWeeks bounds one request. Production rosters run to a few thousand
	// people, so an unbounded range is an unbounded response.
	maxWeeks = 53
)

type capacityResponse struct {
	From   string           `json:"from"` // Monday of the first week
	To     string           `json:"to"`   // Sunday of the last week
	Weeks  []string         `json:"weeks"`
	People []capacityPerson `json:"people"`
}

type capacityPerson struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
	// Allocated[i] is the hours allocated in Weeks[i]. Capacity is WeeklyHours
	// for every week, so it is not repeated per cell.
	Allocated []float64 `json:"allocated"`
}

// Allocation counts Monday–Friday only: assignment spans routinely cover
// weekends, and counting those days would book a full-time person at 56h.
// Rows are summed, not de-duplicated: the data splits one logical assignment
// into many partial rows. Rows sharing a person and span are collapsed before
// expanding into days, which keeps the per-day expansion small.
const capacityQuery = `
WITH weeks AS (
  SELECT unnest($1::date[]) AS week_start
),
spans AS (
  SELECT person_id,
         greatest(start_date, $2::date) AS first_day,
         least(end_date, $3::date)      AS last_day,
         sum(hours_per_day)             AS hours_per_day
  FROM assignments
  WHERE start_date <= $3::date
    AND end_date   >= $2::date
  GROUP BY 1, 2, 3
),
allocated AS (
  SELECT s.person_id,
         date_trunc('week', d)::date AS week_start,
         sum(s.hours_per_day)        AS hours
  FROM spans s
  CROSS JOIN LATERAL generate_series(s.first_day, s.last_day, interval '1 day') AS d
  WHERE extract(isodow FROM d) <= 5
  GROUP BY 1, 2
)
SELECT p.id,
       p.name,
       p.weekly_hours::float8,
       array_agg(coalesce(al.hours, 0)::float8 ORDER BY w.week_start)
FROM people p
CROSS JOIN weeks w
LEFT JOIN allocated al ON al.person_id = p.id AND al.week_start = w.week_start
GROUP BY p.id, p.name, p.weekly_hours
ORDER BY p.name, p.id`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Both dates are inclusive and snapped outward to whole Monday–Sunday weeks,
// so every column in the grid is a complete week.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var weeks []time.Time
	for d := from; d.Before(to); d = d.AddDate(0, 0, 7) {
		weeks = append(weeks, d)
	}

	rows, err := s.db.Query(r.Context(), capacityQuery, weeks, from, to)
	if err != nil {
		log.Printf("query capacity: %v", err)
		writeError(w, http.StatusInternalServerError, "query capacity")
		return
	}
	defer rows.Close()

	resp := capacityResponse{
		From:   from.Format(dateLayout),
		To:     to.Format(dateLayout),
		Weeks:  make([]string, len(weeks)),
		People: []capacityPerson{},
	}
	for i, wk := range weeks {
		resp.Weeks[i] = wk.Format(dateLayout)
	}
	for rows.Next() {
		var p capacityPerson
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours, &p.Allocated); err != nil {
			log.Printf("scan capacity: %v", err)
		writeError(w, http.StatusInternalServerError, "scan capacity")
			return
		}
		resp.People = append(resp.People, p)
	}
	if err := rows.Err(); err != nil {
		log.Printf("read capacity: %v", err)
		writeError(w, http.StatusInternalServerError, "read capacity")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// parseRange returns the Monday on or before from and the Sunday on or after to.
func parseRange(fromStr, toStr string) (time.Time, time.Time, error) {
	if fromStr == "" || toStr == "" {
		return time.Time{}, time.Time{}, fmt.Errorf("from and to are required (YYYY-MM-DD)")
	}
	from, err := time.Parse(dateLayout, fromStr)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid from: %q", fromStr)
	}
	to, err := time.Parse(dateLayout, toStr)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid to: %q", toStr)
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, fmt.Errorf("to must not be before from")
	}

	from = from.AddDate(0, 0, -daysSinceMonday(from))
	to = to.AddDate(0, 0, 6-daysSinceMonday(to))

	if weeks := (to.Sub(from).Hours()/24 + 1) / 7; weeks > maxWeeks {
		return time.Time{}, time.Time{}, fmt.Errorf("range spans %.0f weeks; the maximum is %d", weeks, maxWeeks)
	}
	return from, to, nil
}

func daysSinceMonday(t time.Time) int {
	return (int(t.Weekday()) + 6) % 7
}
