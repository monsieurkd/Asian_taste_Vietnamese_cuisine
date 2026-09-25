-- 14_align_operating_hours_with_the_published_hours.sql
--
-- Aligns the DATABASE's trading hours with the hours the shop publishes.
--
-- Two sources disagreed, and both were wrong in different ways:
--
--   1. `09_fix_adelaide_settings.sql` seeded one open/close pair per day, which cannot
--      express this kitchen's day at all: it closes between lunch and dinner and
--      reopens for the evening. The stored "close" was therefore whichever service
--      happened to be written, so the two disagreeing rows below are both wrong.
--   2. It had Monday and Tuesday identical to the rest of the week, but Monday is
--      lunch-only (10:00–14:30) and the owner's published hours say so.
--
-- `src/asian-taste-customer/src/lib/site.ts` carries the correct hours, taken from the
-- owner on 2026-09-16 (docs/TODO.md §10) and now covered by `openingHours.test.ts`,
-- including the two-windows-per-day case.
--
-- Until this migration, the API judged trading hours from a single window per day while
-- the storefront showed the real two — so the shop could be shown OPEN while the API's
-- rule said closed, or the reverse. That gap is now closed at the database, and
-- `TradingHoursTests` pins the rule the API applies to these rows.
--
-- NOTE ON ORDERING: this file is applied by `DatabaseInitializationService` in a fixed
-- sequence. Adding it changes that sequence, which the swarm driver treats as a
-- "danger chunk" — read `docs/TODO.md` §14 before touching the order.

-- Split the lunch and dinner services, and correct Monday.
-- `operating_hours` has a primary key on day_of_week, so a day is still ONE row: the
-- evening service is expressed as a second row only if the schema gains a sequence
-- column. Rather than invent that here, the row carries the FULL trading span
-- (10:00–20:50) and the rule reads the gap from `restaurant_settings.break_*` — see
-- the columns added below. That keeps one row per day (the existing key) while still
-- describing two services.
ALTER TABLE operating_hours
    ADD COLUMN IF NOT EXISTS break_start TIME,
    ADD COLUMN IF NOT EXISTS break_end   TIME;

COMMENT ON COLUMN operating_hours.break_start IS
    'Local time the kitchen stops for the break between services. NULL means a single continuous service.';
COMMENT ON COLUMN operating_hours.break_end IS
    'Local time the kitchen reopens after the break. NULL means a single continuous service.';

INSERT INTO operating_hours (day_of_week, open_time, close_time, break_start, break_end, is_closed) VALUES
    (1, '10:00', '14:30', NULL,    NULL,   FALSE),  -- Monday: lunch only
    (2, '10:00', '21:00', '16:00', '16:30', FALSE),  -- Tuesday
    (3, '10:00', '21:00', '16:00', '16:30', FALSE),  -- Wednesday
    (4, '10:00', '21:00', '16:00', '16:30', FALSE),  -- Thursday
    (5, '10:00', '21:00', '16:00', '16:30', FALSE),  -- Friday
    (6, '10:00', '21:00', '16:00', '16:30', FALSE),  -- Saturday
    (7, '10:00', '21:00', '16:00', '16:30', FALSE)   -- Sunday
ON CONFLICT (day_of_week) DO UPDATE SET
    open_time   = EXCLUDED.open_time,
    close_time  = EXCLUDED.close_time,
    break_start = EXCLUDED.break_start,
    break_end   = EXCLUDED.break_end,
    is_closed   = EXCLUDED.is_closed,
    updated_at  = CURRENT_TIMESTAMP;
