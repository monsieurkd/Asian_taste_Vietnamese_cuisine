# Answered on 2026-09-16 — kept as the record of what was asked

These were open questions in `docs/TODO.md`. The owner has now answered each
one; the answers are applied in the code and the current state lives in
`docs/TODO.md`. This file is history, not current state — do not act on it.

---

## 10. Questions still open

Only the ones still unanswered. The rest moved into the decisions table.

- **Does Lightspeed expose an API on the restaurant's plan?** This is the one that
  decides whether item 7 is a week of work or a non-starter. Ask alongside which
  product it is.
- **Are there existing menu photos?** The menu renders without images by design —
  the only files in the repo are photos of a printed menu board, which would
  mislead customers. Real dish photography is the single biggest visual
  improvement available, and it's a photography job rather than a code one.
- **Is the printed menu the source of truth for prices?** The seed has 82 items at
  the prices in `Menu.md`. If the board differs, the board wins and the seed needs
  updating.
- **Who changes prices once it's live?** Today it needs a deploy. This decides how
  urgent menu editing becomes.

### Added during the UI port (2026-09-15) — decisions I made, and what needs you

The front-ends were rebuilt against the ratified design set in
`docs/DESIGN/mockups/`. Everything below is a place where the design set and the
live system genuinely disagreed. **I picked the option that keeps the app honest
and reversible; none of it is settled fact.**

1. **Dine-in is not offered, because the API cannot accept it.** *(needs you)*
   The mockups draw three services (delivery / pickup / dine in) but the API's
   `OrderType` has two values — `Delivery` and `Pickup` — and the live marketplace
   listing is delivery-only. I shipped **two** buttons rather than a third that
   would fail at checkout or write an order type the kitchen cannot receipt.
   *If the restaurant does dine in*, this needs an API enum value plus a table
   number field, and then the button is a 10-minute change. `HANDOFF.md` §10
   item 3 raises the same question.

2. **The order tracker shows 5 stages, not the mockups' 6.** *(decision,
   reversible)* The design set draws `placed → confirmed → preparing → ready →
   out for delivery → completed`. The API stores six statuses and has no
   separate "out for delivery". I mapped the fifth stage onto `Ready` so the
   customer never sees progress the backend did not record. *To change it*, add
   the status to the API and the extra stage appears.
   The admin console still *shows* the sixth column ("Ready & out" merges ready +
   delivery) because that is where the handover actually happens.

3. **The 82 dishes now carry their printed option groups.** *(decision — worth a
   look)* `modifier_groups` is a stub: `AdminMenuController` returns an empty
   list with a `// TODO: Add IMenuRepository.GetAllModifierGroupsAsync`, and the
   seed has no modifier rows, so **every dish answered `0 option groups`**. The
   ordering flow in the mockups is built entirely around those choices.
   I transcribed the choices the paper menu actually prints (protein, cooking
   method, rice type, the 1–5 heat scale) from `docs/DESIGN/source/Menu.md` into
   `src/lib/menuModel.ts`, matched by dish name. The API's own groups win the
   moment they exist — the adapter prefers them.
   *What this means for you:* the options are real menu content, not invention,
   but a choice's `delta` (e.g. Combo pho +$1.00) is **displayed** and is **not
   yet sent to the API**, because there is nowhere to send it. If a customer
   picks a paid option today the kitchen sees it in the ticket notes and the
   price the API charges is the base price. The real fix is seeding the modifier
   tables. Flagged rather than hidden.

4. **Seven of the 82 dishes have a photo; the other 75 render the woven
   placeholder.** *(correct behaviour, no action)* `menu_items.image_url` is NULL
   for all 82 — migration `10_clear_unverified_dish_images.sql` cleared it. The
   seven photos now live in `src/asian-taste-customer/public/dishes/` and the
   rest fall back honestly. **Three pairings are inferred from item names and
   have never been confirmed by eye** (`pad-thai`, `combination-noodle-bowl-salad`,
   `crispy-pork-noodle-bowl-salad`) — a human should look. Correcting one is a
   data edit in `src/lib/dishPhotos.ts`, not a code change.

5. **Reports and Settings were removed from the admin app.** *(decision)* No
   mockup covers them and neither had real content — Reports was mock analytics
   and Settings had no API behind it. A screen with invented numbers is worse
   than no screen. The routes are gone; nothing else referenced them.

6. **The real phone number and trading hours are now in the app, and I need you
   to confirm them.** *(needs you)* The footer used to carry `123 Main Street`,
   invented hours and a Sydney `(02)` number. I replaced them with the shop's own
   published details: `329 Henley Beach Rd, Brooklyn Park SA 5032`,
   **`08 8298 8200`**, `orders@asiantaste.com.au`, and Mon–Tue 10:00–2:30 /
   Wed–Sun 10:00–8:50. The address matches the database and the menu flyer; the
   phone and hours came from the Uber Eats listing. **Please confirm the phone
   number and hours** — they are the two facts a first-time customer checks, and
   `docs/DESIGN/BRIEF.md` §"What we need from the owner" flags both as owner
   input that was never recorded. One place to change them:
   `src/asian-taste-customer/src/lib/site.ts`.

7. **Delivery is selectable, but the database says delivery is off.**
   *(needs you)* `restaurant_settings.enable_delivery` is **`false`** and
   `enable_pickup` is `true` (migration 09: *"delivery not offered at launch"*),
   yet the ordering flow offers delivery at a $5.00 fee that the API does not
   charge and nothing enforces. I kept both buttons because the design set and
   the marketplace listing both show delivery, but **the setting and the UI
   disagree**. Tell me which is true and I will either remove the button or flip
   the setting.

8. **Stripe payment methods are still the ones the dashboard has on.**
   *(no action, cross-reference)* Unchanged by this port — see item 2 above for
   the Klarna / Zip / Link list that needs switching off before live keys.


---

## 11. The UI rebuild — what changed, and how to check it

Both front-ends were rebuilt against the ratified design set in
`docs/DESIGN/mockups/`. The old UI was deleted, not patched: **23 customer
components and 12 admin components removed**, replaced by a modular layer.

### What the new UI is made of

| Layer | Customer | Admin |
|---|---|---|
| Tokens + type | `src/index.css` `@theme` | `src/index.css` `@theme` |
| Primitives | `components/ui/{Button,Panel,Badge,State,Modal,Toast}` | `components/ui/{Primitives,StatusPill,AdminToast}` |
| Shell | `components/layout/{Header,Footer,MobileBar,ServiceBar,Brand}` | `components/AdminLayout` |
| Screens | `pages/*` | `pages/*` |
| Model | `lib/{menuModel,site,dishPhotos}`, `hooks/useMenuIndex` | `lib/orderStatus` |

The palette is the locked one from `brand-spec.md` — cream paper `#F5F0E6`,
white surfaces, deep-brown `#3C2A21`, hairlines `#E8DCC8`, one maroon accent
`#8B3A3A`. **`--tan` and `--brown-light` are gone**, with no aliases left behind:
Tailwind drops an unknown utility silently, so any survivor would render nothing
rather than erroring. Headings are Plus Jakarta Sans, body is Manrope — Playfair
is retired.

### Verified (commands that actually ran)

```bash
cd src/asian-taste-customer && npm run build && npm run lint && npm test   # all pass
cd src/asian-taste-admin    && npm run build && npm run lint && npm test   # all pass
./scripts/check-test-wiring.sh && ./scripts/check-test-health.sh           # 117 tests, unchanged
./scripts/check-ci-integrity.sh --static-only                              # PASS
```

Screens were rendered headlessly at **390 / 768 / 1280** and checked for
horizontal scroll and console errors: **18/18 clean**. The menu renders 82 dishes
across 14 sections with 7 photos and 75 woven placeholders.

### Six things that need you (detail in §10)

1. **Is the phone number `08 8298 8200` and are the hours right?** They came from
   the Uber Eats listing and are now on every page. `lib/site.ts`, one file.
2. **Does the restaurant do dine in?** The mockups draw it; the API's `OrderType`
   has no such value, so there are two service buttons, not three.
3. **Is delivery actually offered?** `restaurant_settings.enable_delivery` is
   `false` in the database, but the UI shows a delivery option with a $5 fee the
   API does not charge. The setting and the screen disagree — tell me which wins.
4. **Two of the seven dish photos need a human eye.** They were matched by name,
   never looked at: pad-thai and the two noodle-bowl salads.
5. **No delivery fee is charged online — is that right?** *(needs you)* The shop's
   API records an order's total from its item prices alone: `CreateOrderRequestDto`
   has no fee field, so anything added at the checkout would be charged to the
   card while the order, the receipt and `PaidAmount` all recorded less. Rather
   than collect money the shop's own records disagree with, the online total is
   the subtotal and delivery is offered at no charge. **If the $5 fee is meant to
   apply, the API needs a fee field first** — say the word and that becomes the
   next piece of work, with the fee appearing in the UI the moment it can be
   recorded. The services and their facts live in
   `src/asian-taste-customer/src/lib/site.ts`.
6. **Cash on pickup can no longer be chosen online.** *(needs you)* The old
   checkout offered "pay at the counter"; the ratified design set's payment step
   is card and wallet only, so that option is gone. Cash still works in store —
   it just is not selectable on the website now. Tell me if you want it back and
   it is a small addition to the payment step.

### One thing to know about the option groups

`modifier_groups` is an empty stub on the API, so every dish answered "0 option
groups" and the whole customisation flow the mockups are built around had
nothing to render. The printed choices (protein, cooking method, rice, the 1–5
spice scale) were transcribed from `docs/DESIGN/source/Menu.md` into
`src/lib/menuModel.ts` and are shown, priced and sent as ticket notes. **A paid
option's surcharge is displayed but not yet charged**, because there is nowhere
in the API to send it — the real fix is seeding the modifier tables, and that is
the next piece of work rather than a UI one.

---

