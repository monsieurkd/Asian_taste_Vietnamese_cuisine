# Lightspeed — what to ask, and what each answer means

Researched 2026-09-16. **Confirm before relying on any of it** — nothing here has
been exercised against a real Lightspeed account, and the pricing is not public.

## The short version

The integration is written and deployed but has never synced a real order, and
**nothing that follows blocks going live**. v1 takes card and Apple Pay for
pickup; POS sync is deferred and must not interfere with the product.

There is one question that decides whether POS sync is a week of work or a
non-starter, and it needs the owner, not you:

> **"Which Lightspeed product is on your invoice — Retail, or Restaurant?"**

## A correction worth knowing

I previously wrote that the code assumes "Lightning/Retail-style `Order`
endpoints" and that Kounta was "K-Series". **Both were wrong.** The mapping is:

| Product | Series | Orders API |
|---|---|---|
| Vend | **X-Series** | REST, self-serve developer app |
| ShopKeep | **S-Series** | — |
| Kounta | **O-Series** | OAuth2 |
| Lightspeed Restaurant (iKentoo lineage) | **K-Series** | REST, partner-gated |
| Lightspeed Retail | **R-Series** | REST + OAuth2, `createSale` |

Kounta is **O-Series**, not K-Series. Anyone repeating the old note would ask the
owner the wrong question and get a useless answer.

## What is and is not gated

- **Retail (X/R-Series)** is effectively self-serve: register a developer app,
  then the **account owner authorises it**. A new X-Series app starts
  "Not Approved" and is capped at ~30 retailer accounts until Lightspeed approves
  it. There is a documented plan restriction: X-Series **personal tokens are
  Plus-plan only**.
- **Restaurant K-Series** is **approval-gated** to partners via the Partner
  Program. This is the one that can genuinely stop the work.
- **No published API pricing exists for any line.** It routes to partner/sales
  approval. So "does this cost money" cannot be answered from documentation.
- I found **no evidence** for the claim that R-Series order injection is a paid
  add-on. Treat that as unconfirmed, not as fact.

## The three questions, ranked by what they cost to get wrong

1. **Which product — Retail or Restaurant?** Different APIs, different account
   IDs, different gates. Everything else depends on this.
2. **"Is API access included on my plan, or does it need an upgrade, and is
   partner approval required?"** Ask Lightspeed **sales** this, verbatim. There is
   no public price list, so it is the only way to find out.
3. **Who can authorise an app against the account?** It must be the account
   owner, in a browser. Not something we can do for them.

## What each answer means for us

| Answer | Consequence |
|---|---|
| Retail, API on the plan | POS sync is achievable. Register an app, owner authorises, we finish the payload. Days, not weeks — the code is already written. |
| Restaurant K-Series | Partner approval first. Until then POS sync stays off and the dashboard is the kitchen's view. |
| "No API on our plan" | Settled. POS sync is removed rather than deferred, and the tablet stays the kitchen's view permanently. |
| Owner never gets back | **Nothing breaks.** Orders still reach the kitchen via the dashboard; `lightspeed_sync_status = Failed` is the retrier giving up, not a broken order. |

## Why a week of silence is not urgent

The restaurant can trade today without this. The admin dashboard is the kitchen's
view, which is the decision already recorded in `docs/TODO.md`. POS sync is a
convenience (one system instead of two), not a dependency.

**Suggested nudge** — short, concrete, easy to answer from a phone:

> Hi — quick one so I can stop guessing about the till integration. Two questions:
> 1. On your Lightspeed invoice, does it say **Retail** or **Restaurant**?
> 2. Can you ask Lightspeed whether API access is included on your plan, or if it
>    needs an upgrade?
>
> No rush — orders are already reaching the kitchen through the dashboard, so
> nothing is blocked. It just decides whether we wire the till up or leave it as is.

## Do not

- Do not wire POS sync into the order path. It is queued and retried precisely so
  a POS failure can never fail a paid order.
- Do not treat `lightspeed_sync_status = Failed` as a broken order.
- Do not assume the payload shape works — `product`, `description` and `note` are
  a reading of the docs, never tested against a real account. Expect to iterate on
  the first live order.
