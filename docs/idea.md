# Vendor Price-Increase Defense Desk

## Overview

Vendor Price-Increase Defense Desk (VPIDD) is a SaaS platform that validates every supplier price-increase letter against the governing contract (caps, fixed-price periods, indexation formulas, notice windows) and the published cost-driver indices the supplier claims to be tracking, then generates a data-backed pushback packet the buyer can send back. It turns a manual, error-prone, low-bandwidth review into a deterministic, auditable workflow that protects margin one letter at a time.

When a supplier sends an increase letter, a procurement or category manager logs it (or forwards it in), links it to the active contract, and the Desk runs a battery of deterministic checks: is the proposed effective date inside a contracted fixed-price period? Does the percentage exceed a contractual annual cap? Is the supplier inside a contractual notice window? Does the claimed index movement (e.g. PPI, CPI, ECI, a commodity index) actually match the published movement over the relevant period? Have stacked increases over multiple years quietly breached a cumulative multi-year cap? Each check produces a verdict (compliant, partial, breach) with the exact clause citation and the index math. The Desk then assembles a pushback packet, routes it through an approval workflow with a full audit trail, and rolls the accepted-vs-contested deltas into an annualized P&L margin-impact view for the CFO.

## Problem

Suppliers fire off price-increase letters in inflation waves, often quarterly, frequently citing "rising input costs," "indexation," or "market conditions." Buyers lack the bandwidth to check each letter against the actual contract and the actual published index movement, so they over-accept. A 1-2 point over-acceptance across a large supplier base is real, recurring margin erosion. The contract that should constrain the increase is a PDF nobody re-reads; the index the supplier cites is rarely validated against the real series; and multi-year cumulative caps are almost never tracked because nobody remembers last year's increase. There is a clear trigger (every letter) and CFO-sponsored cost-control mandates, but no tooling that closes the loop from letter to clause to index to pushback to P&L.

## Target Users

- Procurement and category managers at mid-market and enterprise companies in inflation-exposed sectors (manufacturing, food and beverage, logistics, facilities, industrial distribution).
- Contracts and commercial teams who own the governing agreements and the clause language.
- Strategic sourcing leads running annual cost-out programs.
- CFO and finance partners who sponsor margin-protection and want the annualized P&L rollup.

**Buyer:** Procurement/category manager and the contracts team, with CFO-sponsored margin-protection backing and budget authority. **Demand:** suppliers raise prices in quarterly inflation waves and buyers over-accept; shaving 1-2 points across a large supplier base protects real margin, a P&L-positive deliverable with high willingness to pay, triggered on every increase letter plus CFO cost-control mandates.

## Why this is NOT an existing project

Near-neighbors and why VPIDD is distinct:

- **freight-invoice-audit** audits already-rendered freight invoices against agreed rate tables (did they bill what we agreed). VPIDD validates *inbound, forward-looking price-increase letters* before they become invoices, against contract clauses and published indices, and generates negotiation pushback. Different object (letter vs invoice), different time (forward vs already-billed), different deliverable (pushback packet vs invoice dispute).
- **price-monitoring** scrapes competitor or market web prices for pricing intelligence. VPIDD never scrapes a marketplace; it ingests a specific supplier's letter and the contract that governs it.
- **renewal-clock-tower** is the nearest base: it tracks renewal and notice deadlines. VPIDD borrows the notice-window concept but is about validating the *substance* of a price increase (caps, indexation, index movement, cumulative creep), not just firing a deadline reminder.
- **tail-spend-consolidation-planner** rationalizes fragmented supplier spend (consolidate vendors). VPIDD does not consolidate spend; it defends individual increase events.
- **payment-terms-working-capital-optimizer** optimizes DPO and payment-term economics. VPIDD does not touch payment terms; it contests unit-price increases.

VPIDD's unique core: the increase-letter object, the clause-check engine, the index-validation engine that compares a claimed cost-driver index movement to the actual published series, the cumulative multi-year creep tracker, the clause-cited pushback-packet generator, and the accept-vs-contest P&L rollup. No sibling combines inbound-letter intake + clause check + index validation + pushback generation + margin rollup.

## Feature Sections

### 1. Increase-Letter Intake
- Log a supplier increase letter with supplier, proposed percent (or per-line absolute amounts), effective date, stated justification, and received date.
- Attach the raw letter (paste text or store a reference); capture sender contact.
- Parse multi-line increases (different percents per SKU/category) into structured line items.
- Quick-capture form and bulk paste; auto-suggest matching supplier and contract.
- Status lifecycle: draft, logged, under-review, packet-ready, sent, accepted, contested, withdrawn, resolved.
- Duplicate-letter detection on same supplier + effective date.

### 2. Contract Repository & Clause Library
- Store contracts with effective dates, term, renewal, currency, and governing entity.
- Capture price-governance clauses: annual increase cap percent, fixed-price period windows, indexation formula and base index, notice-window days, cumulative multi-year cap, most-favored-nation and price-protection clauses.
- Clause types tagged so the engine knows which checks apply.
- Link a contract to a supplier; version contracts as they are amended.
- Clause citation snippets stored verbatim for use in pushback packets.

### 3. Clause-Check Engine
- For each logged letter, evaluate every applicable clause and emit a per-clause verdict (compliant/partial/breach) with severity.
- Cap check: proposed percent vs contractual annual cap.
- Fixed-price-period check: effective date inside a no-increase window.
- Notice-window check: was sufficient notice given before the effective date.
- Indexation-eligibility check: is the supplier even entitled to an indexed increase this period.
- Aggregate letter verdict and a defensibility score (how much of the increase is contestable).

### 4. Index Validation
- Maintain a library of cost-driver indices (PPI, CPI, ECI, commodity/energy indices, FX) with periodic published data points.
- Compare the supplier's claimed index movement to the actual published movement over the relevant period.
- Compute the entitled increase implied by the index formula vs the proposed increase; flag the over-ask delta.
- Support weighted index baskets (e.g. 60% steel PPI + 40% labor ECI).
- Show the math transparently: base value, current value, percent change, formula application.

### 5. Cumulative-Creep Tracker
- Track all increases per contract over time and compute cumulative compounded movement.
- Detect when stacked increases breach a multi-year cumulative cap.
- Timeline view of every increase event with running compounded total against the cap.
- Alert when the next proposed increase would breach the cumulative cap.

### 6. Pushback-Packet Generator
- Assemble a packet: letter summary, each failing clause with verbatim citation, index math, cumulative-creep evidence, and a recommended counter-percent.
- Template library for tone (firm, collaborative, escalation) and reusable rebuttal paragraphs.
- Editable draft; export to copyable text/markdown.
- Track packet version history and which was sent.

### 7. Approval Workflow & Audit Trail
- Multi-step approval (reviewer, approver) per letter or packet with configurable thresholds.
- Decision log: every state change, who/when/why, immutable audit trail.
- Comment threads per letter.
- Approval thresholds by increase size or annualized dollar impact.

### 8. P&L Margin-Impact Rollup
- Annualized impact per letter from baseline annual spend and the accepted vs contested delta.
- Portfolio rollup: total proposed, total accepted, total avoided (savings), by supplier/category/period.
- Quarter-over-quarter inflation-wave view.
- CFO-ready summary with savings-from-defense metric.

### 9. Supplier Profiles & Scorecards
- Per-supplier history of increase letters, win/loss on contests, average over-ask, defensibility trend.
- Behavior score: how often this supplier over-asks beyond index/cap.
- Spend and contract coverage per supplier.

### 10. Spend Baselines
- Per supplier/category annual baseline spend used to annualize impact.
- Manual entry or seeded; multiple baseline periods.

### 11. Counter-Offer Modeling
- Model scenarios: accept-as-is, accept-capped, accept-indexed-only, reject; show annual dollar impact of each.
- Recommended counter based on the binding constraint (cap vs index vs fixed-price).

### 12. Notice-Window & Deadline Tracking
- Track response deadlines per letter (notice window, internal SLA).
- Calendar of upcoming effective dates and response-due dates.
- Overdue and at-risk indicators.

### 13. Categories & Taxonomy
- Spend categories and subcategories to group suppliers and letters.
- Category-level inflation and contest rollups.

### 14. Document & Citation Snippets
- Store reusable clause-citation snippets and evidence attachments.
- Snippet search to pull the right clause language into a packet.

### 15. Notifications & Alerts
- Per-user notifications: new letter logged, breach detected, deadline approaching, packet ready, approval requested.
- Mark-read; deadline and breach alerts.

### 16. Reporting & Exports
- Savings report, inflation-wave report, supplier-behavior report.
- Export portfolio data and per-letter detail.

### 17. Rebuttal Template Library
- Pre-written rebuttal blocks keyed to breach type (over-cap, index over-ask, fixed-price violation, insufficient notice, cumulative breach).
- Editable, reusable across packets.

### 18. Decision Playbooks
- Configurable rules: auto-recommend contest when over-ask exceeds X%, auto-accept when within index and under cap.
- Threshold settings per category.

### 19. Dashboard & Activity
- Home dashboard: open letters, breaches detected, savings YTD, upcoming deadlines, recent activity feed.
- Activity log of recent events.

### 20. Sample-Data Seeder & Onboarding
- One-click seed of realistic suppliers, contracts, indices, and letters for instant demoability.
- Onboarding checklist guiding setup.

### 21. Settings & Workspace
- Workspace settings: default currency, approval thresholds, playbook defaults.
- Billing/plan view (all features free; Stripe optional).

### 22. Index Data Management
- CRUD on indices and their published data points.
- Import data points; chart movement.

## Data Model (tables)

- workspaces
- suppliers
- categories
- contracts
- contract_clauses
- indices
- index_data_points
- increase_letters
- letter_line_items
- clause_checks
- index_validations
- cumulative_creep_records
- pushback_packets
- packet_sections
- rebuttal_templates
- approvals
- approval_steps
- audit_events
- comments
- spend_baselines
- counter_scenarios
- supplier_scorecards
- notifications
- deadlines
- playbooks
- documents
- activity_log
- plans
- subscriptions

## API Surface (high level)

- /api/v1/workspaces — workspace CRUD + current
- /api/v1/suppliers — supplier CRUD + scorecard
- /api/v1/categories — category CRUD
- /api/v1/contracts — contract CRUD
- /api/v1/clauses — clause CRUD per contract
- /api/v1/indices — index CRUD
- /api/v1/index-data — index data points
- /api/v1/letters — increase-letter CRUD + lifecycle + line items
- /api/v1/clause-checks — run/list clause checks for a letter
- /api/v1/index-validations — run/list index validations
- /api/v1/creep — cumulative-creep computation per contract
- /api/v1/packets — pushback packet CRUD + sections + generate
- /api/v1/templates — rebuttal template CRUD
- /api/v1/approvals — approval workflow
- /api/v1/audit — audit events
- /api/v1/comments — comments per letter
- /api/v1/baselines — spend baselines
- /api/v1/scenarios — counter-offer scenarios
- /api/v1/deadlines — deadline tracking
- /api/v1/playbooks — decision playbooks
- /api/v1/notifications — notifications
- /api/v1/documents — documents/snippets
- /api/v1/reports — savings/inflation/supplier reports
- /api/v1/dashboard — dashboard aggregates
- /api/v1/seed — sample-data seeder
- /api/v1/billing — plan/checkout/portal

## Frontend Pages (~24)

1. `/` — landing (static marketing)
2. `/auth/sign-in` — sign in
3. `/auth/sign-up` — sign up
4. `/pricing` — pricing (static)
5. `/dashboard` — home dashboard
6. `/dashboard/letters` — increase letters list
7. `/dashboard/letters/new` — log a new letter
8. `/dashboard/letters/[id]` — letter detail (checks, validations, creep, packet)
9. `/dashboard/suppliers` — suppliers list + scorecards
10. `/dashboard/suppliers/[id]` — supplier profile
11. `/dashboard/contracts` — contracts list
12. `/dashboard/contracts/[id]` — contract detail + clauses
13. `/dashboard/indices` — index library + data points
14. `/dashboard/packets` — pushback packets list
15. `/dashboard/packets/[id]` — packet builder/detail
16. `/dashboard/templates` — rebuttal template library
17. `/dashboard/approvals` — approval queue
18. `/dashboard/scenarios` — counter-offer modeling
19. `/dashboard/baselines` — spend baselines
20. `/dashboard/deadlines` — deadlines calendar
21. `/dashboard/categories` — categories
22. `/dashboard/playbooks` — decision playbooks
23. `/dashboard/reports` — reporting & exports
24. `/dashboard/notifications` — notifications
25. `/dashboard/audit` — audit trail
26. `/dashboard/settings` — settings + billing
