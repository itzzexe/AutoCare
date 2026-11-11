# Monetization

There are three revenue lines, and all of them are enforced on the server:

1. Subscriptions for car owners, workshops and merchants.
2. Commission on delivered marketplace orders.
3. Paid placement: featured workshops and sponsored products, always labelled as ads.

**Nothing in this document is a revenue forecast.** The admin dashboard (`/admin/billing`) shows only figures read from the ledgers: activated subscriptions, accrued commission, delivered order value, and pending manual payments.

## What stays free, always

These cannot be put behind a plan:
- the meaning of a code, its causes, checks and fixes;
- the fault guides;
- safety warnings;
- the rules-based urgency verdict, including "stop driving";
- the rules-based next step.

When an owner runs out of monthly AI explanations, the diagnosis still returns the complete rules-based result. Only the optional model explanation is skipped (`modelStatusDetail: "plan_allowance"`).

## Plans (seeded **without prices**)

| Plan | Audience | Entitlements (editable in admin) |
|---|---|---|
| `owner_free` | Owners | 3 vehicles, 20 AI explanations/month |
| `owner_pro` | Owners | 15 vehicles, 300 AI explanations/month |
| `workshop_free` | Workshops | Directory listing, appointments |
| `workshop_featured` | Workshops | "Featured workshops" slot (labelled), analytics |
| `merchant_free` | Merchants | 8% commission, 30 quote responses/month, no sponsored products |
| `merchant_pro` | Merchants | 5% commission, 10 sponsored products, 1000 quote responses/month, analytics |

The entitlement numbers and commission rates above are **starting suggestions**, not market research. Prices are left `null` on purpose: they are a business decision for the operator.
- A paid plan becomes visible on `/pricing` only once it has a price and is published.
- The API refuses to publish a paid plan without a price, or to put a price on a free plan.
- Price changes require re-authentication and are written to the audit log.

`pnpm db:seed:demo` sets demo prices locally so the flows can be exercised. Production refuses to run the demo seed.

## How a subscription starts

1. The user picks a plan on `/pricing` or `/account/billing`.
2. The user picks a payment rail:
   - **Online** (Qi Card / ZainCash when configured): a redirect to the gateway's hosted page. The plan activates only after the gateway confirms the payment server-side (see `docs/PAYMENTS.md`).
   - **Manual** (cash or bank transfer, which is common in Iraq): the request waits as `pending_manual`. An admin confirms receipt in `/admin/billing`, which requires re-authentication and is audited, and only then is the plan activated.
3. Only one open request is allowed per subject. Renewals stack on the remaining paid period.
4. Business plans can only be bought by the **owner** of an **approved** merchant or workshop.
5. The daily retention job expires lapsed subscriptions. Reads already ignore them once `period_end` has passed.

## Commission ledger

- One `commission_entries` row is written per merchant sub-order when it is marked **delivered**. The rate is frozen at that moment from the merchant's plan.
- The base is the **parts value only**. Delivery fees pass through to the merchant.
- A returned or cancelled sub-order **voids** its accrued commission.
- Merchants see their own statement under *Merchant console → Commission statement*.
- Invoicing and settlement (`invoiced` / `settled`) are recorded statuses. Collecting the money is an operator process; there is no automatic debit.

## Paid placement rules

- Sponsored products appear in a **separate, labelled block** of at most 3 items above the catalogue.
  - They never change the order or content of the organic results.
  - They never appear in diagnosis recommendations.
- The "sponsored" label appears only while the merchant's paid plan is active. Setting the database flag alone does nothing.
- Merchants can sponsor only up to their plan's allowance.
- Featured workshops appear in a separate, labelled block. The organic directory below stays alphabetical.

## Growth levers already in the product

- **Public, indexable knowledge pages.** There are 2,530 generic codes and 49 symptom and warning-light guides. Each page has a canonical URL and a sitemap entry, and sits behind `INDEXING_ENABLED` until the domain and legal texts are final.
- **Diagnosis entry from the symptom guide.** "Diagnose this for my car" pre-fills the symptoms.
- **Parts and workshop discovery.** Code pages lead to parts and workshops, with honest fitment labels.
- **Recalls.** NHTSA recall campaigns on the vehicle page (labelled as US market), which brings owners back to the app.

## Needs the owner (cannot be done in code)

- Setting prices, and registering the business, tax and invoicing.
- Gateway merchant accounts (see `docs/PAYMENTS.md`).
- Legal review of:
  - the terms of sale;
  - the commission disclosure;
  - advertising labelling under Iraqi consumer rules.
- Technician review of the knowledge base. The content is labelled "draft" until a technician reviews it, and a reviewed knowledge base is the strongest trust signal for paid users.
