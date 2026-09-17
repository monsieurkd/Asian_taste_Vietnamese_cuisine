# Archive — historical documents, do not act on these

Everything in this folder is **superseded, stale, or generated output**. It is kept
because it records how the project got here, not because it is true today.

**For the current state of the project, read [`../TODO.md`](../TODO.md).** That is
the live list. Nothing here overrides it.

---

## Why these were moved out of the repo root

They were being read as if they were current, and two of them actively contradicted
reality. A root directory with four progress documents and no way to tell which one
is authoritative is how a wrong answer gets quoted confidently — the same failure
mode as the `VITE_API_URL` / `VITE_API_BASE_URL` bug, where the wrong name was
documented and so was set.

The rename suffix on each file (`_stale`, `_superseded`, `_artifact`) is deliberate:
if one of these is ever pasted into a conversation out of context, its filename still
says it is not current.

---

## What is in here

| File | What it was | Status |
|---|---|---|
| [`CURRENT_PROGRESS_stale.md`](CURRENT_PROGRESS_stale.md) | 1,069-line "LLM-readable progress tracker", last updated 2026-02-25 | **Stale.** Its own dates say Feb 2026 while the work continued to Sep 2026. `MAJOR_UPDATE_PLAN.md:115` and `SESSION_NOTES_2026-09-10.md:362` both already flagged it as out of date. Had a task assigned to "reconcile" it (item A7) that was never done — superseded by `../TODO.md` instead. |
| [`MAJOR_UPDATE_PLAN.md` superseded](MAJOR_UPDATE_PLAN_superseded.md) | 242-line plan, 2026-09-10, marked "Proposed — awaiting approval" | **Superseded.** Its two tracks (stabilise/localise, then compete in Adelaide) were absorbed into `../TODO.md` and `../DEPLOYMENT.md`. Valuable for the Adelaide market research in sections 1–2, which is not recorded elsewhere. |
| [`ASIAN_TASTE_PRD_superseded.md`](ASIAN_TASTE_PRD_superseded.md) | 1,564-line product requirements doc | **Not wrong — superseded.** The built system moved past it (Stripe over its payment assumptions, admin app deployed, POS deferred). Still cited for two facts that exist nowhere else: the address, and that the venue's POS is Lightspeed K-Series. |
| [`CI_TEST_REPORT_artifact.md`](CI_TEST_REPORT_artifact.md) | 179-line CI/test report | **Generated output, not a source doc.** The `ci-test-guardian` and `test-author` skills write this file; it is a record of one run, not a living document. |
| [`SESSION_NOTES_2026-09-10.md`](SESSION_NOTES_2026-09-10.md) | 404-line session log for the session that ended 2026-09-10 | **Historical, and was already flagged as such in its own header** — it reported 82 tests and an undeployed admin app, both of which changed on 2026-09-13. Moved here 2026-09-17 so `docs/` holds only reference material; its content is history, not state. |
| [`2026-09-16-owner-answers.md`](2026-09-16-owner-answers.md) | The owner's answers to the four open questions (phone, hours, delivery, cash) | **Applied, not current reading.** Every answer was folded into `../TODO.md` §10 and into restaurant settings. Kept as the record of what was asked and answered, and when. |

---

## What does *not* belong here

A stale question is not the same as a stale decision. Two things stay out of this
folder:

- **Open work.** Review-shaped work — a design/structure review, a bug report, a
  proposed change — is a **GitHub issue**, so it has an assignee, labels and a
  comment thread. `docs/TODO.md` then records that it is outstanding and links to
  it. A markdown "ticket" in `docs/` duplicates the tracker and drifts from it.
- **Reference material that is still true.** `../ARCHITECTURE.md`,
  `../DEPLOYMENT.md`, `../GUARDRAILS.md`, `../ui-rubric.md`, `../ui-qa-loop.md`
  and everything under `../DESIGN/` and `../research/` describe how the system
  works today. They belong in `docs/` even when they are not read often.

---

## menu-board-photos/

Four photographs of the restaurant's printed menu board.
They are **orphan assets** — referenced by nothing in the codebase — and they must not
be used as customer-facing menu imagery, because photos of a printed board mislead
customers. Real dish photography is still outstanding; see `../TODO.md` item 10.

---

## Before you delete anything here

Check the file is genuinely dead first:

```bash
grep -rn "CURRENT_PROGRESS_stale\|MAJOR_UPDATE_PLAN_superseded\|ASIAN_TASTE_PRD_superseded" \
  --include='*.md' --include='*.sh' --include='*.yml' . | grep -v node_modules
```

Two references are intentional and should survive any future cleanup:

- `docs/GUARDRAILS.md` points at `CI_TEST_REPORT_artifact.md` as the place the
  guardrail evidence is recorded.
- `.reasonix/skills/ci-test-guardian/SKILL.md` and `test-author/SKILL.md` instruct the
  skills to write their report there. If the skills are ever run again, they will try
  to create `CI_TEST_REPORT.md` in the repo root. Move it here again afterwards, or
  update the skill to write into `docs/archive/` directly.
