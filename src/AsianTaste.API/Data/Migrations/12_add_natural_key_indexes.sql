-- Migration 12: enforce the menu's natural keys
--
-- Runs LAST in InitializeAsync, after the menu has been rebuilt from
-- 02_seed_data.sql. Two indexes:
--
--   ux_menu_items_name_category  — a dish name is unique within its category.
--   ux_categories_name           — a category name is unique.
--
-- They cannot live in 01_create_schema.sql: that script runs before the seed, so
-- on a database that accumulated duplicates (the old unguarded menu_items INSERT
-- appended all 82 dishes on every application start) the CREATE UNIQUE INDEX
-- would abort the entire schema script and the API would refuse to start. 11
-- de-duplicates and the seed rebuilds; only then is the invariant true.
--
-- These are not just cleanliness. ux_menu_items_name_category is the conflict
-- target of the seed's ON CONFLICT (name, category_id), so without it the seed
-- cannot be re-run at all; and it is what stops two concurrent writers from
-- creating the same dish twice — a race the application-level check cannot close.
--
-- Also adds the indexes the schema expected from categories (display_order /
-- is_active already exist in 01; the name key did not).
--
-- Idempotent: safe to run repeatedly.

-- 1. menu_items: the seed's ON CONFLICT target. Created here rather than in the
--    schema so it is only asserted once the data can satisfy it.
CREATE UNIQUE INDEX IF NOT EXISTS ux_menu_items_name_category ON menu_items(name, category_id);

-- 2. categories: the same guarantee for the other seeded table, which also
--    carries ON CONFLICT (id) DO NOTHING and an explicit-id insert.
CREATE UNIQUE INDEX IF NOT EXISTS ux_categories_name ON categories(name);
