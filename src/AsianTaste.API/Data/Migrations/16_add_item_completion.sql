-- 16_add_item_completion.sql
--
-- Lets the kitchen tick off individual dishes, and records that the customer has
-- been told the order is ready.
--
-- WHY THIS EXISTS. Completion was only ever expressible per ORDER: `orders.status`
-- moves Pending -> Confirmed -> Preparing -> Ready -> Completed, and there was no
-- statement anywhere for "the pho is done, the spring rolls are not". A ticket with
-- four dishes therefore had exactly one honest answer to "what is left?", and it was
-- the whole order. Cooks compensated the way they always have — by reading the items
-- and remembering — which works until the pass is busy, and then a bag goes out with
-- a dish missing or a starter sits under the lamp while the mains are plated.
--
-- The tick is a LINE-level fact, so it is stored per line.
--
-- A NOTE ON WHAT THIS IS NOT. `is_completed` is not a fulfilment status for the line;
-- it is a "the cook has this on the pass" mark, and it is deliberately forgettable —
-- unticking a line is allowed and changes nothing else, because a mistap on a tablet
-- must not be a decision the kitchen cannot take back.
--
-- `orders.ready_notified_at` exists so the ready message is sent AT MOST ONCE. The
-- notification fires from "every line is now done", which is a condition that can be
-- re-reached by unticking and re-ticking a line, by two tablets racing on the last
-- two lines, or by a retried request. Without a recorded send, each of those is a
-- second email to a customer who is already standing at the counter — and the second
-- one is the one that gets read as "your order is ready" for food they collected ten
-- minutes ago.
--
-- NOTE ON ORDERING: applied by `DatabaseInitializationService` in a fixed sequence.
-- Adding a migration changes that sequence, which the swarm driver treats as a danger
-- chunk — see docs/TODO.md §14 before touching the order.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS ready_notified_at TIMESTAMP WITH TIME ZONE;

-- The board asks "for these open orders, which lines are done?" on every refresh, so
-- the lookup is by order. Partial, because only completed lines are counted and the
-- vast majority of lines in the table are historical rows that are all completed.
CREATE INDEX IF NOT EXISTS idx_order_items_completed
    ON order_items(order_id) WHERE is_completed = FALSE;

COMMENT ON COLUMN order_items.is_completed IS
    'True once a cook has marked this dish done. A pass mark, not a fulfilment status: '
    'it can be unticked, and unticking does not move the order backwards.';

COMMENT ON COLUMN order_items.completed_at IS
    'When the line was ticked. Not used to decide anything — kept so "when did this '
    'dish actually leave the wok" is answerable later, which is the question a '
    'which-bag-was-slow morning-after asks.';

COMMENT ON COLUMN orders.ready_notified_at IS
    'When the customer was emailed that this order is ready. Sent at most once: the '
    'trigger is "all lines done", which can be re-reached by an untick/retick or a '
    'race between two tablets.';
