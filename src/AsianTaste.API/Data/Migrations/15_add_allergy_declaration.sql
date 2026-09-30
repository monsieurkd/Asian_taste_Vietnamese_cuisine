-- 15_add_allergy_declaration.sql
--
-- Gives allergy information its own column, rather than mixing it into `notes`.
--
-- WHY THIS EXISTS. An "Allergy" option group was seeded into `modifier_groups` in
-- migration 13, for the dishes where it matters (Pho, Laksa, Pad Thai, the noodle
-- dishes). It has never once been reachable: the customer app builds a dish's options
-- from `src/asian-taste-customer/src/lib/menuModel.ts` (the printed menu), and that
-- table contains no allergy group at all. So the seeded group could not be selected by
-- anybody, and the app's own option mapper — the one that WOULD read it — is dead code.
--
-- The practical effect: an allergy could only reach the kitchen if the customer typed it
-- into the free-text order note, which they mostly do not, because nothing asks.
--
-- Two changes go with this column, and all three are needed before an allergy actually
-- reaches the kitchen:
--
--   1. This column, so the declaration is a FIELD rather than a sentence in `notes`.
--   2. The checkout asks for it directly (not per dish — a person has an allergy, a
--      dish does not), so it is a question with a visible answer rather than a blank box.
--   3. The kitchen ticket shows it as its own block, above the items, because a line
--      under the third dish is not where a cook looks before starting.
--
-- Deliberately a single text field and not a fixed list. Allergies are open-ended
-- ("sesame", "shellfish", "MSG", "the fish sauce"), a dropdown would exclude the one
-- that matters, and a wrong entry here is a medical outcome rather than a wrong order.
--
-- NOTE ON ORDERING: applied by `DatabaseInitializationService` in a fixed sequence.
-- Adding a migration changes that sequence, which the swarm driver treats as a danger
-- chunk — see docs/TODO.md §14 before touching the order.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS allergy_declaration TEXT;

COMMENT ON COLUMN orders.allergy_declaration IS
    'Allergies or dietary requirements the customer declared at checkout, verbatim. '
    'Free text on purpose: an allergy list that cannot express the customer''s actual '
    'allergy is worse than no list. Shown prominently on the kitchen ticket.';
