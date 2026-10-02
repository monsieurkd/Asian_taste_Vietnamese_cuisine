-- 17_add_back_of_house_workflow.sql
--
-- Gives the kitchen the three things a pass actually needs and could not express:
-- WHO cooked a dish, WHAT STATE it is in beyond done/not-done, and a way to take a
-- ticket off the line without destroying it.
--
-- WHY THIS EXISTS. The tick shipped in migration 16 answers exactly one question —
-- "is this dish done?" — and that is one question short of how a kitchen works:
--
--   * A cook cannot say "the pho is on". `is_completed` is a single boolean, so the
--     only recordable fact is that a dish is finished. Between "not started" and
--     "plated" there is the entire job, and the board shows nothing of it. A ticket
--     where half the dishes are cooking reads identically to one nobody has touched.
--   * Nothing records WHO. `is_completed` has no author, so when a bag goes out wrong
--     there is no way to answer "who ticked it" — and `orders.updated_at` only ever
--     says the row changed, not which of four dishes a person dealt with.
--   * Nothing can HOLD an order. The only way to take a ticket off the line was to
--     cancel it, which tells the customer their order is dead. "This one is waiting on
--     the spring rolls" and "this customer is late" are not cancellations.
--
-- DESIGN NOTES, each deliberate:
--
--   `cook_state` is a text column, not a Postgres enum. Every order-level status in
--   this schema is an enum and adding a member to one means ALTER TYPE, which cannot
--   run inside the transaction the migration service uses. The states here are the
--   kitchen's, they will change as the shop learns how it works, and a CHECK constraint
--   gets the same protection without the migration cost.
--
--   The WHO columns are nullable and NOT foreign keys to admin_users. A kitchen is
--   staffed by whoever is on, accounts get retired, and a historical ticket that cannot
--   be read because the account it references was deleted is worse than one that names
--   a person by username. The username is denormalised on purpose, exactly as
--   `menu_item_name` is on the line: it is a record of what happened, not a lookup.
--
--   `order_activity` is an append-only log. Every other table here holds CURRENT state,
--   which is enough to run service and useless for answering "what happened to order
--   42?" an hour later — the question asked when something goes wrong. It is written
--   from the same code path as the state change so the two cannot disagree.
--
-- NOTE ON ORDERING: applied by `DatabaseInitializationService` in a fixed sequence.
-- This one only ADDS, so it runs last with migration 16 — see docs/TODO.md §14 before
-- touching the order.

-- ============================================
-- Per-dish cook state
-- ============================================

-- What a cook is doing with a dish. Distinct from `is_completed`, which stays the
-- binary "is it out of the kitchen" flag so nothing already written breaks.
ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS cook_state VARCHAR(20) NOT NULL DEFAULT 'Queued',
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cooked_by VARCHAR(100),
    -- The kitchen's own note on a dish, separate from the customer's instructions.
    -- "no coriander" is what the customer asked for; "ran out of beansprouts, used
    -- cabbage" is what the cook needs the front to know.
    ADD COLUMN IF NOT EXISTS kitchen_note TEXT,
    ADD COLUMN IF NOT EXISTS note_by VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_cook_state_check'
    ) THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_cook_state_check
            CHECK (cook_state IN ('Queued', 'Cooking', 'Done'));
    END IF;
END
$$;

-- ============================================
-- Order-level hold
-- ============================================

-- A held order keeps its stage and its dishes; it simply stops being the next thing
-- the kitchen looks at, and says why. Null means not held, so the common case costs
-- nothing and no query has to know the difference between "not held" and "held for no
-- reason".
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS held_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS held_reason TEXT,
    ADD COLUMN IF NOT EXISTS held_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orders_held
    ON orders(held_at) WHERE held_at IS NOT NULL;

-- ============================================
-- Activity log
-- ============================================

CREATE TABLE IF NOT EXISTS order_activity (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- The line it concerns, when it concerns one. NULL for order-level events.
    order_item_id INT REFERENCES order_items(id) ON DELETE SET NULL,
    -- What happened: 'ItemCookState', 'ItemCompleted', 'StatusChanged', 'Held',
    -- 'Resumed', 'NoteAdded', 'ItemsEdited', 'OrderCreated', 'ReadyNotified'.
    kind VARCHAR(40) NOT NULL,
    -- A sentence written for a person to read, not a diff. See the service for why.
    detail TEXT NOT NULL,
    actor VARCHAR(100),
    -- The stage the order was in when this was written. Kept as text and not a live
    -- foreign key, so the log reads correctly even if the status vocabulary changes.
    status_at_event VARCHAR(40),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The only query shape there is: "everything that happened to this order, in order".
CREATE INDEX IF NOT EXISTS idx_order_activity_order
    ON order_activity(order_id, created_at DESC);

COMMENT ON COLUMN order_items.cook_state IS
    'The kitchen''s working state for a dish: Queued, Cooking or Done. Text with a CHECK '
    'rather than an enum, because an enum needs ALTER TYPE and cannot be extended inside '
    'the migration service''s transaction.';

COMMENT ON COLUMN order_items.kitchen_note IS
    'A note written BY the kitchen about this dish, not the customer''s instructions. '
    'Kept separate because mixing them makes the customer''s allergy note compete with '
    'the cook''s substitution note for the same line.';

COMMENT ON COLUMN orders.held_at IS
    'When the order was taken off the line. NULL means it is live. A held order keeps its '
    'stage and dishes; it only stops being the next thing the kitchen looks at.';

COMMENT ON TABLE order_activity IS
    'Append-only log of what happened to an order and who did it. Written from the same '
    'code path as the state change, so the log and the state cannot disagree.';
