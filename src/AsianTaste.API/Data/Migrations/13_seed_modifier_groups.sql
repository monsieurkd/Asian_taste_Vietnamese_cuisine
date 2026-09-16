-- ============================================
-- Migration 13: the printed option groups, seeded
-- Date: 2026-09-16
--
-- WHY THIS EXISTS
--
-- The ordering flow is built entirely around per-dish choices — the design set
-- spends a whole screen on them, and the kitchen reads protein, heat and extras
-- off the ticket. But `modifier_groups` and `modifiers` were created by
-- 01_create_schema.sql and then never populated: `GetItemByIdAsync` returned an
-- empty list for all 82 dishes, so the customer saw "No choices needed" on a
-- bowl of pho and the kitchen never learned which protein was ordered.
--
-- WHAT IT SEEDS
--
-- The four groups the owner specified on 2026-09-16, which is what the printed
-- menu already implies:
--
--   Spice level   1–5, optional (the customer is never blocked by it;
--                 the kitchen reads the number off the ticket)
--   Allergy       free text is handled at the dish level, so this group carries
--                 the common declarations as a multi-select
--   Combo         the printed combos (e.g. pho with the combination upgrade)
--   Extras        multi-select: extra protein +4.00, soup +3.00,
--                 rice/noodle +2.00, sauce +2.00
--
-- PRICE ISOLATION — read before editing
--
-- The Extras choices carry their price_adjustment, so the API prices them the
-- moment they are selected. They are attached ONLY to dishes where the printed
-- menu charges for them. Attaching "extra rice +2.00" to a dish that already
-- includes rice would silently make it $2 dearer for every customer who picked
-- it, which is the kind of bug nobody notices until the refunds arrive.
--
-- EXTENSIBILITY
--
-- Groups are per-dish rows keyed on menu_item_id, so the owner can add a group
-- to one dish without touching another. `source` records where a group came
-- from: 'seed' (this file) or 'manual' (added in the admin app). The admin UI
-- must only edit 'manual' rows, so re-running this migration never fights an
-- owner's change.
--
-- RE-RUNNABLE. Every insert is guarded on (menu_item_id, name) — the natural
-- key — so a restart cannot duplicate a group. This matters: 02_seed_data.sql
-- once appended all 82 dishes on every boot and the menu rendered each dish
-- twice.
-- ============================================

-- ---------------------------------------------------------------
-- 1. Provenance column, so a seeded group is distinguishable from
--    one the owner adds later. The admin app edits only 'manual'.
-- ---------------------------------------------------------------
ALTER TABLE modifier_groups
    ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN modifier_groups.source IS
    'seed = shipped in a migration and safe to re-run; manual = added in the admin app and never overwritten';

-- De-duplicate BEFORE creating the unique indexes below.
--
-- A unique index cannot be built over existing duplicates, and because every
-- statement in this file shares one transaction, a 23505 here aborts the whole
-- script and the API fails to boot. Migration 11 re-parents modifier_groups onto
-- a surviving dish when it merges duplicated menu items, which can leave two
-- groups with the same name on one dish — so duplicates are reachable, not
-- hypothetical.
--
-- Same ordering rule as migrations 11 -> 12: remove the duplicates, then add the
-- index that keeps them from coming back. The lowest id survives because it is
-- the row a customer's existing order most likely points at.
-- ---------------------------------------------------------------
-- Dedupe, in the order the foreign keys force.
--
-- `order_item_modifiers.modifier_id` is a plain FK with NO ON DELETE action, so
-- deleting a modifier an order references raises 23503. Every statement in this
-- file shares one transaction, so that aborts the script and the API fails to
-- boot. The row is repointed rather than dropped: the customer really did choose
-- that extra, only the row id was wrong.
--
-- The ORDER below is load-bearing and was got wrong at first:
--
--   `modifiers.modifier_group_id -> modifier_groups` is ON DELETE CASCADE, so
--   deleting a duplicate GROUP silently removes every modifier in it — including
--   ones an order references. Repointing only same-group duplicates (the obvious
--   first move) does not cover that: a doomed group's choices have no twin inside
--   their own group, so nothing repointed them and the cascade then deleted them.
--
-- So: resolve group survival first, then repoint, then delete groups (which
-- cascades), then delete the leftover same-group modifier duplicates.
-- ---------------------------------------------------------------

-- 1. Repoint every modifier pointing at a doomed GROUP onto the same-named
--    modifier in the surviving group for that dish. Done before any delete, so
--    the cascade below can never remove a row an order still references.
UPDATE order_item_modifiers oim
   SET modifier_id = keep_mod.id
  FROM modifiers dup_mod
  JOIN modifier_groups dup_grp ON dup_grp.id = dup_mod.modifier_group_id
  JOIN modifier_groups keep_grp
    ON keep_grp.menu_item_id = dup_grp.menu_item_id
   AND keep_grp.name = dup_grp.name
   AND keep_grp.id = (
       -- Pin to MIN(id) rather than any lower id. With three or more copies,
       -- `keep_grp.id < dup_grp.id` alone can land on an intermediate row that
       -- is itself deleted, leaving a dangling reference.
       SELECT MIN(g2.id) FROM modifier_groups g2
        WHERE g2.menu_item_id = dup_grp.menu_item_id AND g2.name = dup_grp.name
   )
  JOIN modifiers keep_mod
    ON keep_mod.modifier_group_id = keep_grp.id
   AND keep_mod.name = dup_mod.name
   AND keep_mod.id = (
       SELECT MIN(m3.id) FROM modifiers m3
        WHERE m3.modifier_group_id = keep_grp.id AND m3.name = dup_mod.name
   )
 WHERE oim.modifier_id = dup_mod.id
   AND dup_grp.id <> keep_grp.id;

-- 2. Delete the duplicate groups, which cascades to their modifiers.
--
--    Guarded, NOT unconditional. Step 1 only repoints a modifier whose NAME
--    exists in the surviving group; a doomed group can legitimately hold a choice
--    the survivor does not (an owner-added 'manual' group predates the unique
--    index this file is about to create). That row would still be referenced by
--    order_item_modifiers, and the cascade would hit the NO ACTION foreign key:
--    23503, rollback, API will not boot.
--
--    So a group is only removed when EVERY one of its modifiers has a same-named
--    twin in the survivor. A group that fails that test is left alone — it is a
--    genuine duplicate on the name, but merging it would lose an option a
--    customer has already ordered, and losing an order's option is worse than
--    leaving an unreferenced-by-the-index duplicate for a human to look at. The
--    unique index below will then refuse, loudly, which is the right outcome:
--    migration 11 documents the same preference for a loud failure over a silent
--    merge.
DELETE FROM modifier_groups dup
 WHERE EXISTS (
     SELECT 1 FROM modifier_groups keep
      WHERE keep.menu_item_id = dup.menu_item_id
        AND keep.name = dup.name
        AND keep.id < dup.id
 )
 -- every choice in this group exists by name in the SAME survivor step 1 uses.
 --
 -- The twin test must name the MIN(id) group, not "any lower-id group". With
 -- three or more copies of a group name on one dish — reachable, because
 -- migration 11 re-parents every duplicate's groups onto the MIN survivor — an
 -- intermediate group can itself survive this delete (it holds a choice the MIN
 -- group lacks). Treating that intermediate row as a valid twin would let a
 -- higher group be deleted even though step 1 never repointed its modifiers:
 -- step 1's only destination is MIN(id). The cascade would then drop a modifier
 -- an order still references, and the NO ACTION foreign key aborts the boot.
 --
 -- Pinning both the repoint and this guard to MIN(id) is what makes their target
 -- sets coincide, so every row about to be removed has already had its
 -- references moved.
 AND NOT EXISTS (
     SELECT 1
       FROM modifiers dm
      WHERE dm.modifier_group_id = dup.id
        AND NOT EXISTS (
            SELECT 1
              FROM modifiers km
              JOIN modifier_groups kg ON kg.id = km.modifier_group_id
             WHERE kg.id = (
                       SELECT MIN(g3.id) FROM modifier_groups g3
                        WHERE g3.menu_item_id = dup.menu_item_id
                          AND g3.name = dup.name
                   )
               AND km.name = dm.name
        )
 );

-- 3. Same-group modifier duplicates, now that no group is about to vanish.
UPDATE order_item_modifiers oim
   SET modifier_id = keep.id
  FROM modifiers dup
  JOIN modifiers keep
    ON keep.modifier_group_id = dup.modifier_group_id
   AND keep.name = dup.name
   AND keep.id = (
       SELECT MIN(m2.id) FROM modifiers m2
        WHERE m2.modifier_group_id = dup.modifier_group_id AND m2.name = dup.name
   )
 WHERE oim.modifier_id = dup.id
   AND dup.id <> keep.id;

DELETE FROM modifiers dup
 WHERE EXISTS (
     SELECT 1 FROM modifiers keep
      WHERE keep.modifier_group_id = dup.modifier_group_id
        AND keep.name = dup.name
        AND keep.id < dup.id
 );

-- A group name is unique per dish. Without this the guard below has nothing to
-- conflict on and the seed would duplicate on every start.
CREATE UNIQUE INDEX IF NOT EXISTS ux_modifier_groups_item_name
    ON modifier_groups (menu_item_id, name);

-- A choice name is unique within its group, for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS ux_modifiers_group_name
    ON modifiers (modifier_group_id, name);

-- ---------------------------------------------------------------
-- 2. Spice level — every dish, optional. Seeded is_required = FALSE so an
--    unfilled picker can never block a customer from ordering.
--    The printed menu says "spicy level 1 to 5 ... default is level 3".
--    Range groups carry no choices; the kitchen reads the number.
-- ---------------------------------------------------------------
INSERT INTO modifier_groups (menu_item_id, name, is_required, min_select, max_select, display_order, source)
SELECT mi.id, 'Spice level', FALSE, 0, 1, 10, 'seed'
  FROM menu_items mi
ON CONFLICT (menu_item_id, name) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Extras — multi-select. These carry the money, so they are
--    attached only where the printed menu charges.
-- ---------------------------------------------------------------
INSERT INTO modifier_groups (menu_item_id, name, is_required, min_select, max_select, display_order, source)
SELECT mi.id, 'Extras', FALSE, 0, 8, 40, 'seed'
  FROM menu_items mi
ON CONFLICT (menu_item_id, name) DO NOTHING;

-- The four extras the owner named, on every dish that offers extras. Whether
-- the surcharge is *right* for a given dish is the next statement's job.
INSERT INTO modifiers (modifier_group_id, name, price_adjustment, is_available, display_order)
SELECT mg.id, x.name, x.price, TRUE, x.ord
  FROM modifier_groups mg
  CROSS JOIN (VALUES
      ('Extra protein', 4.00, 1),
      ('Extra soup',    3.00, 2),
      ('Extra rice/noodle', 2.00, 3),
      ('Extra sauce',   2.00, 4)
  ) AS x(name, price, ord)
 WHERE mg.name = 'Extras'
   AND mg.source = 'seed'
ON CONFLICT (modifier_group_id, name) DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Combo — the printed "Combo" upgrades. Only the dishes that
--    actually have a combo on the paper menu, so a customer is
--    never sold an upgrade the kitchen has not priced.
-- ---------------------------------------------------------------
INSERT INTO modifier_groups (menu_item_id, name, is_required, min_select, max_select, display_order, source)
SELECT mi.id, 'Combo', FALSE, 0, 1, 30, 'seed'
  FROM menu_items mi
 WHERE mi.name IN (
     'Pho - Beef noodle soup (1 choice)',
     'Spicy beef noodle soup',
     'Wok-tossed soft egg noodle - Chicken / Beef',
     'Wok-tossed soft egg noodle - Seafood'
 )
ON CONFLICT (menu_item_id, name) DO NOTHING;

INSERT INTO modifiers (modifier_group_id, name, price_adjustment, is_available, display_order)
SELECT mg.id, 'Make it a combination', 1.00, TRUE, 1
  FROM modifier_groups mg
 WHERE mg.name = 'Combo'
   AND mg.source = 'seed'
ON CONFLICT (modifier_group_id, name) DO NOTHING;

-- ---------------------------------------------------------------
-- 5. Allergy — declarations the customer wants the kitchen to see.
--    No price: this is information, not an upgrade, and charging
--    for it would be indefensible.
-- ---------------------------------------------------------------
INSERT INTO modifier_groups (menu_item_id, name, is_required, min_select, max_select, display_order, source)
SELECT mi.id, 'Allergy', FALSE, 0, 6, 20, 'seed'
  FROM menu_items mi
 WHERE mi.name LIKE 'Pho%'
    OR mi.name LIKE '%Laksa%'
    OR mi.name IN ('Pad Thai', 'Singapore noodle', 'Mongolian noodle')
ON CONFLICT (menu_item_id, name) DO NOTHING;

INSERT INTO modifiers (modifier_group_id, name, price_adjustment, is_available, display_order)
SELECT mg.id, x.name, 0, TRUE, x.ord
  FROM modifier_groups mg
  CROSS JOIN (VALUES
      ('No coriander',        1),
      ('No onion',            2),
      ('No chilli',           3),
      ('No bean sprouts',     4),
      ('No peanuts',          5)
  ) AS x(name, ord)
 WHERE mg.name = 'Allergy'
   AND mg.source = 'seed'
ON CONFLICT (modifier_group_id, name) DO NOTHING;

-- ---------------------------------------------------------------
-- 6. Stop the Extras group charging for something a dish already
--    includes.
--
--    "Extra rice/noodle" only makes sense where rice or noodles are a
--    real CHOICE, because that is when a second serving has to be
--    cooked. Everywhere else the plate already comes with its rice, so
--    offering the extra would take $2 for nothing — the kind of
--    overcharge a customer spots on the receipt, not in the basket.
--
--    This is an ALLOW-LIST (`IN`), not a deny-list. The first version of
--    this statement used NOT IN and so did the exact opposite: it left
--    the surcharge switched ON for every rice bowl and switched it off
--    for the wok dishes where rice genuinely IS a choice. A deny-list is
--    also the wrong shape regardless — a new dish added to the menu would
--    silently inherit the surcharge rather than being considered.
--
--    The row is kept and only marked unavailable, so the group stays
--    visible and the kitchen still sees an explicit "no extras" rather
--    than a group that appears to be missing.
-- ---------------------------------------------------------------
-- enable the extra ONLY where rice or noodles are a printed choice.
UPDATE modifiers m
   SET is_available = TRUE
  FROM modifier_groups mg
  JOIN menu_items mi ON mi.id = mg.menu_item_id
 WHERE m.modifier_group_id = mg.id
   AND mg.name = 'Extras'
   AND mg.source = 'seed'
   AND m.name = 'Extra rice/noodle'
   AND mi.name IN (
       'Rice Bowl - Lemongrass Tofu',
       'Rice Bowl - Crispy Chicken or Pork',
       'Rice Bowl - Satay Chicken',
       'Rice Bowl - Spicy chicken',
       'Rice Bowl - Garlic butter chicken',
       'Rice Bowl - Soy-pepper Beef',
       'Rice Bowl - Sunny egg & Crispy pork',
       'Rice Bowl - Curry (Green/Yellow)',
       'Mix veg cashew nut (Chicken)',
       'Mix veg in creamy satay sauce (Chicken)',
       'Mix veg in Malaysian curry (Chicken)',
       'Mix veg with spicy chilli basil (Chicken)',
       'Mix veg in Thai green curry (Chicken)',
       'Mix veg in cashew nut (Beef)',
       'Mix veg in black bean sauce (Beef)',
       'Mix veg in Mongolian sauce (Beef)',
       'Mix veg with spicy chilli basil (Beef)',
       'Mix veg with black pepper (Beef)'
   );

-- and everywhere else, so the surcharge cannot be taken for rice the dish
-- already comes with.
UPDATE modifiers m
   SET is_available = FALSE
  FROM modifier_groups mg
  JOIN menu_items mi ON mi.id = mg.menu_item_id
 WHERE m.modifier_group_id = mg.id
   AND mg.name = 'Extras'
   AND mg.source = 'seed'
   AND m.name = 'Extra rice/noodle'
   AND mi.name NOT IN (
       'Rice Bowl - Lemongrass Tofu',
       'Rice Bowl - Crispy Chicken or Pork',
       'Rice Bowl - Satay Chicken',
       'Rice Bowl - Spicy chicken',
       'Rice Bowl - Garlic butter chicken',
       'Rice Bowl - Soy-pepper Beef',
       'Rice Bowl - Sunny egg & Crispy pork',
       'Rice Bowl - Curry (Green/Yellow)',
       'Mix veg cashew nut (Chicken)',
       'Mix veg in creamy satay sauce (Chicken)',
       'Mix veg in Malaysian curry (Chicken)',
       'Mix veg with spicy chilli basil (Chicken)',
       'Mix veg in Thai green curry (Chicken)',
       'Mix veg in cashew nut (Beef)',
       'Mix veg in black bean sauce (Beef)',
       'Mix veg in Mongolian sauce (Beef)',
       'Mix veg with spicy chilli basil (Beef)',
       'Mix veg with black pepper (Beef)'
   );

-- ---------------------------------------------------------------
-- 7. Report what was seeded, so a silent no-op is visible in the logs.
-- ---------------------------------------------------------------
DO $$
DECLARE
    group_count INT;
    choice_count INT;
BEGIN
    SELECT COUNT(*) INTO group_count FROM modifier_groups WHERE source = 'seed';
    SELECT COUNT(*) INTO choice_count
      FROM modifiers m
      JOIN modifier_groups mg ON mg.id = m.modifier_group_id
     WHERE mg.source = 'seed';
    RAISE NOTICE 'Option groups seeded: % groups, % choices', group_count, choice_count;
END $$;
