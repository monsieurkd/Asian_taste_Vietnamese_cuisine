-- Migration 11: de-duplicate menu_items
--
-- Context: 02_seed_data.sql runs on every application start
-- (DatabaseInitializationService.InitializeAsync). Its categories INSERT was
-- guarded with ON CONFLICT (id) DO NOTHING, but the menu_items INSERT was not —
-- and it supplies no id, so there was nothing to conflict on either. Every
-- restart therefore appended all 82 dishes again under fresh ids.
--
-- The visible symptom: the customer menu rendered every dish twice (164 cards
-- for 82 distinct dishes), and opening a dish from the menu took you to a
-- different row than the same dish in a search result.
--
-- By the time anyone looked, the dev database held ids 1-82 and their exact
-- duplicates 83-164. This migration:
--   1. Repoints every reference at the surviving row, so no order loses a line
--      item and no dish loses its customisation options.
--   2. Deletes the exact-twin duplicate rows, keeping the LOWEST id in each group.
--   3. Repairs the id sequence.
--   (The unique index that makes it permanent is migration 12's job.)
--
-- Idempotent: safe to run repeatedly.
--
-- NOTE ON ORDERING: this file runs as migration 11, i.e. BEFORE 02_seed_data.sql
-- within a single InitializeAsync (schema -> 11 -> 02 -> 04-10 -> 12). The
-- ordering is forced by the fix itself:
--
--   The seed conflicts on (name, category_id), and ON CONFLICT is rejected
--   outright until the unique index backing it exists (SQLSTATE 42P10) — but that
--   index cannot be created while duplicate dishes are still present. So the
--   duplicates have to be removed here, first; then 02 can seed; then 12 adds the
--   index. Nothing here needs the seed to have run: it operates on whatever rows
--   the table already holds, and on a fresh database it matches nothing.
--
-- Matching key: (name, category_id) — a dish name is unique within its category.
-- Duplicates are only ever the identical re-run, so price/description are equal
-- too; the surviving row keeps its category, making the repointing below a
-- no-op rather than a move between categories.

-- ---------------------------------------------------------------
-- 1. The surviving row per duplicate group, as a view-like CTE.
--    A dish name is unique within its category, so (name, category_id) is the
--    natural key and MIN(id) is the original row — the one customers saw first
--    and the one any existing order most likely points at.
--
--    Written three times below (repoint, move, delete) rather than kept as a
--    temp table, so the whole migration stays re-runnable and leaves nothing
--    behind.
-- ---------------------------------------------------------------

-- 1a. Order line items that point at a duplicate. order_items.menu_item_id is
--     NOT NULL with a plain FK and NO ACTION on delete, so the duplicate cannot
--     be removed while a line item references it — the DELETE below would abort
--     with 23503 and the migration would fail. Repoint instead of dropping:
--     the customer still bought that dish, only the row id was wrong.
--
--     `oi.menu_item_id = dup.id` is what makes the mapping per doomed row, so each
--     line item lands on the surviving row for ITS OWN dish. Do not drop it, and do
--     not move it into the join's ON clause: Postgres allows UPDATE ... FROM to
--     combine the target table with everything in FROM without constraining how, so
--     every order line would be matched against every duplicate row. That is not
--     hypothetical — it repointed an order for "Cold rolls" (id 1) to "Snack Super
--     Deal" (id 84), a dish the customer never ordered.
--
--     order_item_modifiers keeps its own (modifier_id, modifier_name) copy, so
--     nothing there needs repointing.
--
--     The target set here must be EXACTLY the set the DELETE below removes, or an
--     order line can be repointed onto a dish that survives — one it was never
--     for. Two conditions make that true, and both are load-bearing:
--       * `keep.id < dup.id` — destination must be the LOWER id, mirroring the
--         DELETE's predicate. Without it, `dup.id <> d.keep_id` also matches rows
--         ABOVE the survivor, so an order line on a doomed row can be moved to a
--         higher-id row that the DELETE then also removes, or (worse) to a
--         non-twin that happens to share the name.
--       * the twin comparison — price, description and every dietary flag, using
--         IS NOT DISTINCT FROM so NULLs compare equal.
--     With both, every repoint lands on a row that is identical and survives.
UPDATE order_items oi
   SET menu_item_id = d.keep_id
  FROM (
      SELECT MIN(id) AS keep_id, name, category_id
        FROM menu_items
       GROUP BY name, category_id
      HAVING COUNT(*) > 1
  ) d
  JOIN menu_items keep
    ON keep.id = d.keep_id
  JOIN menu_items dup
    ON dup.name = d.name
   AND dup.category_id = d.category_id
   AND dup.id > d.keep_id
   AND dup.base_price IS NOT DISTINCT FROM keep.base_price
   AND dup.description IS NOT DISTINCT FROM keep.description
   AND dup.is_available = keep.is_available
   AND dup.is_popular = keep.is_popular
   AND dup.is_gluten_free = keep.is_gluten_free
   AND dup.is_vegetarian = keep.is_vegetarian
   AND dup.is_vegan = keep.is_vegan
   AND dup.spicy_level = keep.spicy_level
 WHERE oi.menu_item_id = dup.id;

-- 1b. Lightspeed product mapping. menu_items.lightspeed_product_id records which
--     POS product a dish came from; that stays true for the surviving row, so
--     carry it over rather than losing it with the deleted row.
--
--     Direction matters and is easy to invert: the row being UPDATEd must be the
--     SURVIVOR (keep), reading from the doomed duplicate. The first version had it
--     backwards — `UPDATE menu_items dup SET ... = COALESCE(dup..., src...)` with
--     `d.keep_id = src.id` — which wrote the survivor's value onto the row it was
--     about to delete, so a mapping held only on a duplicate was still lost. That
--     is exactly the outcome this step exists to prevent.
--
--     Guarded so it is a no-op if the column is absent: migration 06 adds it, and
--     this migration must not assume 06 has run.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'menu_items' AND column_name = 'lightspeed_product_id'
    ) THEN
        -- `src` is the survivor being updated; it is joined explicitly rather than
        -- referenced through the UPDATE target's alias, because an UPDATE target is
        -- not in scope inside the FROM clause's own joins (Postgres: "invalid
        -- reference to FROM-clause entry"). Keeping it a separate joined table also
        -- keeps the twin comparison identical in shape to the two repoints above.
        UPDATE menu_items src
           SET lightspeed_product_id = COALESCE(src.lightspeed_product_id, dup.lightspeed_product_id)
          FROM (
              SELECT MIN(id) AS keep_id, name, category_id
                FROM menu_items
               GROUP BY name, category_id
              HAVING COUNT(*) > 1
          ) d
          JOIN menu_items keep ON keep.id = d.keep_id
          JOIN menu_items dup
            ON dup.name = d.name
           AND dup.category_id = d.category_id
           AND dup.id > d.keep_id
           AND dup.base_price IS NOT DISTINCT FROM keep.base_price
           AND dup.description IS NOT DISTINCT FROM keep.description
           AND dup.is_available = keep.is_available
           AND dup.is_popular = keep.is_popular
           AND dup.is_gluten_free = keep.is_gluten_free
           AND dup.is_vegetarian = keep.is_vegetarian
           AND dup.is_vegan = keep.is_vegan
           AND dup.spicy_level = keep.spicy_level
         WHERE src.id = d.keep_id
           AND dup.lightspeed_product_id IS NOT NULL;
    END IF;
END
$$;

-- 1c. Modifier groups hanging off a duplicate. Modifiers and modifier groups
--     cascade on delete, so those rows would vanish silently — taking a dish's
--     customisation options with them, because the surviving row owns none.
--     Move them to the surviving row instead.
--
--     This must cover EVERY duplicate, not just the second one. Restricting it to
--     the lowest duplicate (as an earlier version did) leaves the groups on a third
--     and later copies to be cascade-deleted — silent data loss that only shows up
--     with three or more copies. The predicate is a plain `mg.menu_item_id = dup.id`
--     with no MIN(), so a group on any doomed row is re-parented.
--
--     A duplicate's own groups are all re-parented to the same survivor, so the
--     survivor ends up owning all of them — which is the intent: they are the
--     customisation options for the dish the survivor represents.
--
--     Both halves of the target set must match 1a exactly (see its comment): the
--     direction (`dup.id > d.keep_id`) AND the twin comparison. With only the
--     direction, a same-named but DIFFERENT dish that survives — say a $14.00
--     variant beside the $15.50 original — would have its own modifier groups
--     silently re-parented onto the survivor, so the option set shown for one dish
--     becomes the other's.
UPDATE modifier_groups mg
   SET menu_item_id = d.keep_id
  FROM (
      SELECT MIN(id) AS keep_id, name, category_id
        FROM menu_items
       GROUP BY name, category_id
      HAVING COUNT(*) > 1
  ) d
  JOIN menu_items keep
    ON keep.id = d.keep_id
  JOIN menu_items dup
    ON dup.name = d.name
   AND dup.category_id = d.category_id
   AND dup.id > d.keep_id
   AND dup.base_price IS NOT DISTINCT FROM keep.base_price
   AND dup.description IS NOT DISTINCT FROM keep.description
   AND dup.is_available = keep.is_available
   AND dup.is_popular = keep.is_popular
   AND dup.is_gluten_free = keep.is_gluten_free
   AND dup.is_vegetarian = keep.is_vegetarian
   AND dup.is_vegan = keep.is_vegan
   AND dup.spicy_level = keep.spicy_level
 WHERE mg.menu_item_id = dup.id;

-- ---------------------------------------------------------------
-- 2. Delete the duplicates, keeping the lowest id per (name, category_id).
--    modifier_groups.modifiers cascade from here (ON DELETE CASCADE), so no
--    orphaned modifiers are left behind.
--
--    The delete is deliberately narrow: a row is only removed if it is an exact
--    twin of the MIN(id) SURVIVOR it is being removed in favour of (same price,
--    description and dietary flags). Two genuinely different dishes that happen to
--    share a name inside one category are NOT duplicates, and merging them would
--    silently destroy a dish and rewrite the orders that referenced it — with no
--    undo.
--
--    `keep.id < dup.id` is NOT enough on its own, and this is the subtle part: it
--    asks "does ANY lower row match", while the repoints above compare against
--    MIN(id) specifically. In a mixed group — say {1: old price, 84: new, 165: new}
--    — that lets this delete row 165 even though 165 is not a twin of the MIN
--    survivor, while no repoint covers 165. order_items would then reference a
--    deleted row and the DELETE aborts with 23503 (and modifier_groups on 165 would
--    already have been cascade-deleted). Pinning the comparison to MIN(id) makes
--    this delete set exactly the repoints' set: every row removed here has had its
--    references moved, and no row is removed that the repoints did not cover.
--
--    Reached when a price changes between two seeded runs. Left in place, the
--    CREATE UNIQUE INDEX below fails loudly at startup naming the statement — a
--    conversation, rather than a silent data loss.
-- ---------------------------------------------------------------
DELETE FROM menu_items dup
 WHERE EXISTS (
     SELECT 1
       FROM (
           SELECT MIN(id) AS keep_id, name, category_id
             FROM menu_items
            GROUP BY name, category_id
           HAVING COUNT(*) > 1
       ) d
       JOIN menu_items keep ON keep.id = d.keep_id
      WHERE keep.name = dup.name
        AND keep.category_id = dup.category_id
        AND keep.id < dup.id
        -- Only an exact twin of the survivor may be collapsed away. The repoints
        -- above use this identical predicate, which is what keeps the two sets equal.
        AND keep.base_price IS NOT DISTINCT FROM dup.base_price
        AND keep.description IS NOT DISTINCT FROM dup.description
        AND keep.is_available = dup.is_available
        AND keep.is_popular = dup.is_popular
        AND keep.is_gluten_free = dup.is_gluten_free
        AND keep.is_vegetarian = dup.is_vegetarian
        AND keep.is_vegan = dup.is_vegan
        AND keep.spicy_level = dup.spicy_level
 );

-- ---------------------------------------------------------------
-- 3. Repair the sequence after the deletes.
--
--    `setval(seq, n)` sets the NEXT value to n+1, so calling it with the row count
--    is subtly wrong: on an empty table (a fresh database, where this migration
--    runs before the seed) COALESCE(MAX(id), 1) yields 1, the next nextval() returns
--    2, and the first dish lands on id 2 instead of 1. Every id in the seeded menu
--    then shifts by one, so a fresh install does not match a known-good one.
--
--    setval(seq, n, is_called) is the fix: passing is_called => false makes the
--    next nextval() return n itself. With the table empty that is 1; with rows
--    present it is MAX(id) + 1, which is the first unused id.
--
--    Only meaningful when the table has rows; on an empty table this must leave the
--    sequence ready to hand out 1, which is what the third argument does — and it
--    also stops the call from touching a sequence the seed is about to populate.
-- ---------------------------------------------------------------
SELECT setval(
    'menu_items_id_seq',
    COALESCE((SELECT MAX(id) FROM menu_items), 0) + 1,
    false
);

-- ---------------------------------------------------------------
-- 4. The unique index that makes this permanent is created by
--    12_add_natural_key_indexes.sql, which runs after the seed. It is not created
--    here: this migration may legitimately leave a pair of same-named-but-different
--    dishes in place (see step 2), and asserting the constraint before the seed has
--    had its say would report a false conflict on a non-duplicate.
-- ---------------------------------------------------------------
