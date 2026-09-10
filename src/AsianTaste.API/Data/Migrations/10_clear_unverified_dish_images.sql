-- Migration 10: clear unverified dish image references
--
-- Context: menu_items.image_url existed from the first schema but the seed never
-- populated it, so every dish rendered an empty image slot. The UI-QA loop
-- flagged that repeatedly as the largest drag on the customer "appetite & trust"
-- axis.
--
-- An attempt was made to point dishes at four images sitting in the repo's
-- menu/ directory. The design judge reviewed them across two viewports and
-- reported that they are photographs of a PRINTED MENU, not of food:
--
--   "[high] The dish card images are photos of a printed menu, not of food —
--    the text on them is illegible and they make the food look unappetising."
--
-- Placing a menu-board photo in a dish's image slot is worse than no image at
-- all: it actively misleads the customer about what the dish looks like. So
-- rather than ship it, this migration clears any such reference and the app
-- falls back to rendering no image slot (the card begins at the dish title).
--
-- The real fix is licensed dish photography supplied by the restaurant. Until
-- then, this keeps the data honest.
--
-- Idempotent: only clears root-relative paths under /menu/.

UPDATE menu_items
   SET image_url = NULL
 WHERE image_url LIKE '/menu/%';
