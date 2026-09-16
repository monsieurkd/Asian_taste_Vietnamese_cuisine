# Design — Asian Taste Vietnamese Cuisine

The design phase that should have come before the code. It exists because the
apps were **styled before they were designed**: they have a coherent token set
and no point of view. This folder is the point of view.

**Read in this order:**

| # | Doc | What it settles |
|---|---|---|
| 1 | [`BRIEF.md`](BRIEF.md) | Who this is for, what it must do, what it must not do, what is blocked on the owner |
| 2 | [`REFERENCES.md`](REFERENCES.md) | What three real reference sites do, and what to borrow vs avoid |
| 3 | [`INVENTORY.md`](INVENTORY.md) | Every screen × every state, plus the defect register |
| 4 | [`DIRECTION.md`](DIRECTION.md) | The art directions, and the one to pick |
| 5 | [`TOKENS.md`](TOKENS.md) | The token system, and the bugs in the current one |
| 6 | [`COMPONENTS.md`](COMPONENTS.md) | The allowed primitives and the **banned patterns** |
| 7 | [`mockups/README.md`](mockups/README.md) | Where mockups live and what they must cover |
| 8 | [`mockups/HANDOFF.md`](mockups/HANDOFF.md) | The delivered mockup set, and how to port it into the apps |
| 9 | [`source/README.md`](source/README.md) | The owner-supplied inputs, verbatim — menu data, style guide, page spec |
| 10 | [`mockups/NEXT-SESSION-PROMPT.md`](mockups/NEXT-SESSION-PROMPT.md) | The copy-paste kickoff for the **port** — hand the mockup set to the next session and build the real screens |

## The rule that makes this folder worth having

**Design decisions are recorded here before they are implemented, and the code
follows the token names.** If a screen needs a value that is not in
`TOKENS.md`, the value is added there first — in a reviewable diff — and then
used. This is what prevents the drift this folder was created to fix: 65
`gray-*` classes on one page, emoji used as icons, and an admin app that never
loads the brand font.

## Status

| Item | State |
|---|---|
| Baseline measured | ✅ 2026-09-14 — `ui-shots/ui-qa-report.md`, 6–8/10, zero `[high]` |
| Reference analysis | ✅ `REFERENCES.md` |
| Screen/state inventory | ✅ `INVENTORY.md` |
| Defect register | ✅ `INVENTORY.md` |
| Art direction chosen | ⬜ **Blocked on owner** — see `BRIEF.md` §What we need from the owner |
| Tokens agreed | ⬜ Proposed in `TOKENS.md`, not yet ratified |
| Wireframes | ⬜ Not started |
| Mockups | ✅ Delivered 2026-09-15 — HTML set at `mockups/src/`, port doc at `mockups/HANDOFF.md`; PNG exports + owner ratification pending |
| Implementation | ⬜ Not started |

## What this folder is not

It is not the old `ui-qa-loop.md` / `ui-rubric.md` system, which stays as a
**regression gate** after the redesign. That loop cannot do design work: its
rubric instructs the model "do **not** propose a redesign" and to only ever
suggest token-level fixes (`scripts/ui-judge.mjs:80-82`). It grades conformance
to the design system, so it scored a design system that is itself generic at
7/10. Keep it, run it in CI, and do not mistake it for a design process.
