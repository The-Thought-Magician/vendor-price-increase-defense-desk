# Build Plan — Vendor Price-Increase Defense Desk

Authoritative build contract. Filenames, mount paths, api method names, and page files declared here are binding. Stack per `_template-report.md`: Hono backend (mount child `api` Hono router under `/api/v1`), Neon Postgres + drizzle, Next.js 16 + `@neondatabase/auth@0.4.2-beta`, `proxy.ts` only, backend trusts `X-User-Id` via `getUserId(c)`. Public reads / auth-gated writes with zod + ownership checks. Frontend calls `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`.

---

## (a) Tables (columns)

- **workspaces**: id, user_id, name, default_currency, approval_threshold_cents, contest_over_ask_pct, settings(jsonb), created_at, updated_at
- **categories**: id, workspace_id→workspaces, user_id, name, parent_id, description, created_at
- **suppliers**: id, workspace_id→workspaces, user_id, name, category_id→categories, contact_name, contact_email, annual_spend_cents, status, notes, created_at
- **contracts**: id, workspace_id→workspaces, user_id, supplier_id→suppliers, name, reference_number, currency, effective_date, term_end_date, version, governing_entity, status, notes, created_at
- **contract_clauses**: id, contract_id→contracts, user_id, clause_type, title, citation_text, cap_pct, cumulative_cap_pct, notice_days, fixed_start_date, fixed_end_date, index_id, index_basket(jsonb), config(jsonb), created_at
- **indices**: id, workspace_id→workspaces, user_id, code, name, source, unit, description, created_at
- **index_data_points**: id, index_id→indices, user_id, period, value, created_at; UNIQUE(index_id, period)
- **increase_letters**: id, workspace_id→workspaces, user_id, supplier_id→suppliers, contract_id→contracts, title, proposed_pct, effective_date, received_date, justification, raw_text, sender_contact, status, defensibility_score, aggregate_verdict, annual_impact_cents, created_at, updated_at
- **letter_line_items**: id, letter_id→increase_letters, user_id, sku, description, current_price_cents, proposed_price_cents, proposed_pct, annual_volume, created_at
- **clause_checks**: id, letter_id→increase_letters, clause_id→contract_clauses, user_id, clause_type, verdict, severity, detail, citation_text, expected_value, actual_value, created_at
- **index_validations**: id, letter_id→increase_letters, user_id, index_id→indices, claimed_pct, base_period, current_period, base_value, current_value, actual_pct, entitled_pct, over_ask_pct, basket(jsonb), detail, created_at
- **cumulative_creep_records**: id, contract_id→contracts, letter_id→increase_letters, user_id, cumulative_pct, cap_pct, breached, timeline(jsonb), created_at
- **pushback_packets**: id, letter_id→increase_letters, workspace_id→workspaces, user_id, title, tone, recommended_counter_pct, body, version, status, created_at, updated_at
- **packet_sections**: id, packet_id→pushback_packets, user_id, section_type, heading, content, position, created_at
- **rebuttal_templates**: id, workspace_id→workspaces, user_id, name, breach_type, tone, body, created_at
- **approvals**: id, workspace_id→workspaces, letter_id→increase_letters, user_id, status, decision_note, created_at, updated_at
- **approval_steps**: id, approval_id→approvals, user_id, step_order, role, status, decided_by, decided_at, note, created_at
- **audit_events**: id, workspace_id→workspaces, user_id, entity_type, entity_id, action, actor, detail(jsonb), created_at
- **comments**: id, letter_id→increase_letters, user_id, author, body, created_at
- **spend_baselines**: id, workspace_id→workspaces, user_id, supplier_id→suppliers, category_id→categories, period, annual_spend_cents, created_at
- **counter_scenarios**: id, letter_id→increase_letters, user_id, name, scenario_type, applied_pct, annual_impact_cents, is_recommended, detail, created_at
- **supplier_scorecards**: id, supplier_id→suppliers (UNIQUE), user_id, total_letters, contests_won, avg_over_ask_pct, behavior_score, total_avoided_cents, updated_at
- **deadlines**: id, workspace_id→workspaces, user_id, letter_id→increase_letters, contract_id→contracts, kind, title, due_date, status, created_at
- **playbooks**: id, workspace_id→workspaces, user_id, name, category_id→categories, contest_over_ask_pct, auto_accept_within_index, auto_accept_under_cap, rules(jsonb), is_active, created_at
- **notifications**: id, workspace_id→workspaces, user_id, type, title, body, link, read, created_at
- **documents**: id, workspace_id→workspaces, user_id, letter_id→increase_letters, contract_id→contracts, name, doc_type, content, url, created_at
- **activity_log**: id, workspace_id→workspaces, user_id, action, entity_type, entity_id, summary, created_at
- **plans**: id(text 'free'/'pro'), name, price_cents, created_at
- **subscriptions**: id, user_id(unique), plan_id→plans, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at

---

## (b) Backend route files

All mount under `/api/v1` via the child `api` Hono router in `src/index.ts`. Every file `export default router`. Auth column: pub = public read (no auth), auth = requires `X-User-Id` (use `getUserId(c)`), with zod validation + ownership checks on writes. Response shapes are JSON.

### `workspaces.ts` → mount `/workspaces`
- GET `/current` — auth — current user's workspace (auto-creates if none) → `{ workspace }`
- GET `/` — auth — list user's workspaces → `[workspace]`
- POST `/` — auth — create workspace → `{ workspace }`
- PUT `/:id` — auth — update workspace settings → `{ workspace }`

### `categories.ts` → mount `/categories`
- GET `/` — pub — list categories (workspace-scoped via query) → `[category]`
- GET `/:id` — pub — category detail → `{ category }`
- POST `/` — auth — create → `{ category }`
- PUT `/:id` — auth — update → `{ category }`
- DELETE `/:id` — auth — delete → `{ success }`

### `suppliers.ts` → mount `/suppliers`
- GET `/` — pub — list suppliers → `[supplier]`
- GET `/:id` — pub — supplier detail → `{ supplier }`
- GET `/:id/scorecard` — pub — supplier scorecard (computed + stored) → `{ scorecard }`
- GET `/:id/letters` — pub — letters for supplier → `[letter]`
- POST `/` — auth — create → `{ supplier }`
- PUT `/:id` — auth — update → `{ supplier }`
- DELETE `/:id` — auth — delete → `{ success }`

### `contracts.ts` → mount `/contracts`
- GET `/` — pub — list contracts → `[contract]`
- GET `/:id` — pub — contract detail with clauses → `{ contract, clauses }`
- POST `/` — auth — create → `{ contract }`
- PUT `/:id` — auth — update → `{ contract }`
- DELETE `/:id` — auth — delete → `{ success }`

### `clauses.ts` → mount `/clauses`
- GET `/` — pub — list clauses by `?contract_id` → `[clause]`
- GET `/:id` — pub — clause detail → `{ clause }`
- POST `/` — auth — create clause → `{ clause }`
- PUT `/:id` — auth — update → `{ clause }`
- DELETE `/:id` — auth — delete → `{ success }`

### `indices.ts` → mount `/indices`
- GET `/` — pub — list indices → `[index]`
- GET `/:id` — pub — index detail with data points → `{ index, data_points }`
- POST `/` — auth — create index → `{ index }`
- PUT `/:id` — auth — update → `{ index }`
- DELETE `/:id` — auth — delete → `{ success }`

### `indexData.ts` → mount `/index-data`
- GET `/` — pub — list data points by `?index_id` → `[data_point]`
- POST `/` — auth — add data point (upsert on index_id+period) → `{ data_point }`
- POST `/import` — auth — bulk import points `{ index_id, points[] }` → `{ inserted }`
- DELETE `/:id` — auth — delete point → `{ success }`

### `letters.ts` → mount `/letters`
- GET `/` — pub — list letters (filter `?status`,`?supplier_id`) → `[letter]`
- GET `/:id` — pub — letter detail (line items, checks, validations, creep, packet refs) → `{ letter, line_items, clause_checks, index_validations, creep, packets }`
- POST `/` — auth — create letter (+ optional line items) → `{ letter }`
- PUT `/:id` — auth — update letter → `{ letter }`
- POST `/:id/status` — auth — transition lifecycle status → `{ letter }`
- DELETE `/:id` — auth — delete → `{ success }`
- GET `/:id/line-items` — pub — list line items → `[line_item]`
- POST `/:id/line-items` — auth — add line item → `{ line_item }`
- DELETE `/:id/line-items/:itemId` — auth — delete line item → `{ success }`

### `clauseChecks.ts` → mount `/clause-checks`
- GET `/` — pub — list checks by `?letter_id` → `[check]`
- POST `/run` — auth — run clause-check engine for `{ letter_id }`, persists checks + updates letter verdict/defensibility → `{ checks, aggregate_verdict, defensibility_score }`

### `indexValidations.ts` → mount `/index-validations`
- GET `/` — pub — list validations by `?letter_id` → `[validation]`
- POST `/run` — auth — run index validation for `{ letter_id, index_id?, base_period, current_period }` (supports basket from clause), persists → `{ validation }`

### `creep.ts` → mount `/creep`
- GET `/` — pub — creep records by `?contract_id` → `[record]`
- POST `/compute` — auth — compute cumulative creep for `{ contract_id }` across its letters, persist record → `{ record }`

### `packets.ts` → mount `/packets`
- GET `/` — pub — list packets (filter `?letter_id`) → `[packet]`
- GET `/:id` — pub — packet detail with sections → `{ packet, sections }`
- POST `/generate` — auth — generate packet for `{ letter_id, tone }` from checks/validations/creep + templates → `{ packet, sections }`
- POST `/` — auth — create blank packet → `{ packet }`
- PUT `/:id` — auth — update packet body/tone/status → `{ packet }`
- POST `/:id/sections` — auth — add section → `{ section }`
- PUT `/:id/sections/:sectionId` — auth — update section → `{ section }`
- DELETE `/:id/sections/:sectionId` — auth — delete section → `{ success }`
- DELETE `/:id` — auth — delete packet → `{ success }`

### `templates.ts` → mount `/templates`
- GET `/` — pub — list rebuttal templates (filter `?breach_type`) → `[template]`
- GET `/:id` — pub — template detail → `{ template }`
- POST `/` — auth — create → `{ template }`
- PUT `/:id` — auth — update → `{ template }`
- DELETE `/:id` — auth — delete → `{ success }`

### `approvals.ts` → mount `/approvals`
- GET `/` — pub — list approvals (filter `?status`,`?letter_id`) with steps → `[approval]`
- GET `/:id` — pub — approval detail with steps → `{ approval, steps }`
- POST `/` — auth — create approval (+ steps) for a letter → `{ approval, steps }`
- POST `/:id/decide` — auth — decide a step `{ step_id, status, note }`, advance/close approval → `{ approval, steps }`
- DELETE `/:id` — auth — delete → `{ success }`

### `audit.ts` → mount `/audit`
- GET `/` — pub — list audit events (filter `?entity_type`,`?entity_id`) → `[event]`
- POST `/` — auth — record an audit event → `{ event }`

### `comments.ts` → mount `/comments`
- GET `/` — pub — list comments by `?letter_id` → `[comment]`
- POST `/` — auth — add comment → `{ comment }`
- DELETE `/:id` — auth — delete → `{ success }`

### `baselines.ts` → mount `/baselines`
- GET `/` — pub — list spend baselines (filter `?supplier_id`) → `[baseline]`
- POST `/` — auth — create baseline → `{ baseline }`
- PUT `/:id` — auth — update → `{ baseline }`
- DELETE `/:id` — auth — delete → `{ success }`

### `scenarios.ts` → mount `/scenarios`
- GET `/` — pub — list scenarios by `?letter_id` → `[scenario]`
- POST `/model` — auth — model counter-offer scenarios for `{ letter_id }` (generates accept/capped/indexed/reject set, marks recommended) → `[scenario]`
- POST `/` — auth — create custom scenario → `{ scenario }`
- DELETE `/:id` — auth — delete → `{ success }`

### `deadlines.ts` → mount `/deadlines`
- GET `/` — pub — list deadlines (filter `?status`) → `[deadline]`
- GET `/upcoming` — pub — upcoming + overdue deadlines → `{ upcoming, overdue }`
- POST `/` — auth — create deadline → `{ deadline }`
- PUT `/:id` — auth — update (e.g. mark done) → `{ deadline }`
- DELETE `/:id` — auth — delete → `{ success }`

### `playbooks.ts` → mount `/playbooks`
- GET `/` — pub — list playbooks → `[playbook]`
- GET `/:id` — pub — playbook detail → `{ playbook }`
- POST `/` — auth — create → `{ playbook }`
- PUT `/:id` — auth — update → `{ playbook }`
- DELETE `/:id` — auth — delete → `{ success }`

### `notifications.ts` → mount `/notifications`
- GET `/` — auth — current user's notifications → `[notification]`
- POST `/:id/read` — auth — mark read → `{ notification }`
- POST `/read-all` — auth — mark all read → `{ success }`
- DELETE `/:id` — auth — delete → `{ success }`

### `documents.ts` → mount `/documents`
- GET `/` — pub — list documents/snippets (filter `?letter_id`,`?doc_type`) → `[document]`
- GET `/:id` — pub — document detail → `{ document }`
- POST `/` — auth — create document/snippet → `{ document }`
- PUT `/:id` — auth — update → `{ document }`
- DELETE `/:id` — auth — delete → `{ success }`

### `reports.ts` → mount `/reports`
- GET `/savings` — pub — savings (proposed vs accepted vs avoided) rollup → `{ totals, by_supplier, by_category }`
- GET `/inflation-wave` — pub — quarter-over-quarter inflation-wave report → `{ periods }`
- GET `/supplier-behavior` — pub — supplier over-ask/behavior report → `[row]`

### `dashboard.ts` → mount `/dashboard`
- GET `/` — pub — dashboard aggregates → `{ open_letters, breaches_detected, savings_ytd_cents, upcoming_deadlines, recent_activity, counts }`

### `seed.ts` → mount `/seed`
- POST `/` — auth — seed sample suppliers, categories, contracts, clauses, indices, data points, and letters for current workspace → `{ seeded }`
- POST `/reset` — auth — clear workspace sample data → `{ success }`

### `billing.ts` → mount `/billing`
- GET `/plan` — auth — current subscription + plan (auto-creates free) → `{ subscription, plan, stripeEnabled }`
- POST `/checkout` — auth — Stripe checkout session or 503 → `{ url }`
- POST `/portal` — auth — Stripe billing portal or 503 → `{ url }`
- POST `/webhook` — pub — Stripe webhook or 503 → `{ received }`

---

## (c) lib/api.ts method list

Each is `fetch('/api/proxy/<path>')`; mutations send `Content-Type: application/json` + `JSON.stringify`.

**Workspaces**
- `getWorkspace()` → GET `/api/proxy/workspaces/current`
- `listWorkspaces()` → GET `/api/proxy/workspaces`
- `createWorkspace(body)` → POST `/api/proxy/workspaces`
- `updateWorkspace(id, body)` → PUT `/api/proxy/workspaces/:id`

**Categories**
- `getCategories()` → GET `/api/proxy/categories`
- `getCategory(id)` → GET `/api/proxy/categories/:id`
- `createCategory(body)` → POST `/api/proxy/categories`
- `updateCategory(id, body)` → PUT `/api/proxy/categories/:id`
- `deleteCategory(id)` → DELETE `/api/proxy/categories/:id`

**Suppliers**
- `getSuppliers()` → GET `/api/proxy/suppliers`
- `getSupplier(id)` → GET `/api/proxy/suppliers/:id`
- `getSupplierScorecard(id)` → GET `/api/proxy/suppliers/:id/scorecard`
- `getSupplierLetters(id)` → GET `/api/proxy/suppliers/:id/letters`
- `createSupplier(body)` → POST `/api/proxy/suppliers`
- `updateSupplier(id, body)` → PUT `/api/proxy/suppliers/:id`
- `deleteSupplier(id)` → DELETE `/api/proxy/suppliers/:id`

**Contracts**
- `getContracts()` → GET `/api/proxy/contracts`
- `getContract(id)` → GET `/api/proxy/contracts/:id`
- `createContract(body)` → POST `/api/proxy/contracts`
- `updateContract(id, body)` → PUT `/api/proxy/contracts/:id`
- `deleteContract(id)` → DELETE `/api/proxy/contracts/:id`

**Clauses**
- `getClauses(contractId)` → GET `/api/proxy/clauses?contract_id=`
- `getClause(id)` → GET `/api/proxy/clauses/:id`
- `createClause(body)` → POST `/api/proxy/clauses`
- `updateClause(id, body)` → PUT `/api/proxy/clauses/:id`
- `deleteClause(id)` → DELETE `/api/proxy/clauses/:id`

**Indices**
- `getIndices()` → GET `/api/proxy/indices`
- `getIndex(id)` → GET `/api/proxy/indices/:id`
- `createIndex(body)` → POST `/api/proxy/indices`
- `updateIndex(id, body)` → PUT `/api/proxy/indices/:id`
- `deleteIndex(id)` → DELETE `/api/proxy/indices/:id`

**Index data**
- `getIndexData(indexId)` → GET `/api/proxy/index-data?index_id=`
- `addIndexData(body)` → POST `/api/proxy/index-data`
- `importIndexData(body)` → POST `/api/proxy/index-data/import`
- `deleteIndexData(id)` → DELETE `/api/proxy/index-data/:id`

**Letters**
- `getLetters(params)` → GET `/api/proxy/letters`
- `getLetter(id)` → GET `/api/proxy/letters/:id`
- `createLetter(body)` → POST `/api/proxy/letters`
- `updateLetter(id, body)` → PUT `/api/proxy/letters/:id`
- `setLetterStatus(id, status)` → POST `/api/proxy/letters/:id/status`
- `deleteLetter(id)` → DELETE `/api/proxy/letters/:id`
- `getLineItems(id)` → GET `/api/proxy/letters/:id/line-items`
- `addLineItem(id, body)` → POST `/api/proxy/letters/:id/line-items`
- `deleteLineItem(id, itemId)` → DELETE `/api/proxy/letters/:id/line-items/:itemId`

**Clause checks**
- `getClauseChecks(letterId)` → GET `/api/proxy/clause-checks?letter_id=`
- `runClauseChecks(letterId)` → POST `/api/proxy/clause-checks/run`

**Index validations**
- `getIndexValidations(letterId)` → GET `/api/proxy/index-validations?letter_id=`
- `runIndexValidation(body)` → POST `/api/proxy/index-validations/run`

**Creep**
- `getCreep(contractId)` → GET `/api/proxy/creep?contract_id=`
- `computeCreep(contractId)` → POST `/api/proxy/creep/compute`

**Packets**
- `getPackets(letterId)` → GET `/api/proxy/packets`
- `getPacket(id)` → GET `/api/proxy/packets/:id`
- `generatePacket(body)` → POST `/api/proxy/packets/generate`
- `createPacket(body)` → POST `/api/proxy/packets`
- `updatePacket(id, body)` → PUT `/api/proxy/packets/:id`
- `addPacketSection(id, body)` → POST `/api/proxy/packets/:id/sections`
- `updatePacketSection(id, sectionId, body)` → PUT `/api/proxy/packets/:id/sections/:sectionId`
- `deletePacketSection(id, sectionId)` → DELETE `/api/proxy/packets/:id/sections/:sectionId`
- `deletePacket(id)` → DELETE `/api/proxy/packets/:id`

**Templates**
- `getTemplates(breachType)` → GET `/api/proxy/templates`
- `getTemplate(id)` → GET `/api/proxy/templates/:id`
- `createTemplate(body)` → POST `/api/proxy/templates`
- `updateTemplate(id, body)` → PUT `/api/proxy/templates/:id`
- `deleteTemplate(id)` → DELETE `/api/proxy/templates/:id`

**Approvals**
- `getApprovals(params)` → GET `/api/proxy/approvals`
- `getApproval(id)` → GET `/api/proxy/approvals/:id`
- `createApproval(body)` → POST `/api/proxy/approvals`
- `decideApproval(id, body)` → POST `/api/proxy/approvals/:id/decide`
- `deleteApproval(id)` → DELETE `/api/proxy/approvals/:id`

**Audit**
- `getAudit(params)` → GET `/api/proxy/audit`
- `recordAudit(body)` → POST `/api/proxy/audit`

**Comments**
- `getComments(letterId)` → GET `/api/proxy/comments?letter_id=`
- `addComment(body)` → POST `/api/proxy/comments`
- `deleteComment(id)` → DELETE `/api/proxy/comments/:id`

**Baselines**
- `getBaselines(supplierId)` → GET `/api/proxy/baselines`
- `createBaseline(body)` → POST `/api/proxy/baselines`
- `updateBaseline(id, body)` → PUT `/api/proxy/baselines/:id`
- `deleteBaseline(id)` → DELETE `/api/proxy/baselines/:id`

**Scenarios**
- `getScenarios(letterId)` → GET `/api/proxy/scenarios?letter_id=`
- `modelScenarios(letterId)` → POST `/api/proxy/scenarios/model`
- `createScenario(body)` → POST `/api/proxy/scenarios`
- `deleteScenario(id)` → DELETE `/api/proxy/scenarios/:id`

**Deadlines**
- `getDeadlines(params)` → GET `/api/proxy/deadlines`
- `getUpcomingDeadlines()` → GET `/api/proxy/deadlines/upcoming`
- `createDeadline(body)` → POST `/api/proxy/deadlines`
- `updateDeadline(id, body)` → PUT `/api/proxy/deadlines/:id`
- `deleteDeadline(id)` → DELETE `/api/proxy/deadlines/:id`

**Playbooks**
- `getPlaybooks()` → GET `/api/proxy/playbooks`
- `getPlaybook(id)` → GET `/api/proxy/playbooks/:id`
- `createPlaybook(body)` → POST `/api/proxy/playbooks`
- `updatePlaybook(id, body)` → PUT `/api/proxy/playbooks/:id`
- `deletePlaybook(id)` → DELETE `/api/proxy/playbooks/:id`

**Notifications**
- `getNotifications()` → GET `/api/proxy/notifications`
- `markNotificationRead(id)` → POST `/api/proxy/notifications/:id/read`
- `markAllNotificationsRead()` → POST `/api/proxy/notifications/read-all`
- `deleteNotification(id)` → DELETE `/api/proxy/notifications/:id`

**Documents**
- `getDocuments(params)` → GET `/api/proxy/documents`
- `getDocument(id)` → GET `/api/proxy/documents/:id`
- `createDocument(body)` → POST `/api/proxy/documents`
- `updateDocument(id, body)` → PUT `/api/proxy/documents/:id`
- `deleteDocument(id)` → DELETE `/api/proxy/documents/:id`

**Reports**
- `getSavingsReport()` → GET `/api/proxy/reports/savings`
- `getInflationWaveReport()` → GET `/api/proxy/reports/inflation-wave`
- `getSupplierBehaviorReport()` → GET `/api/proxy/reports/supplier-behavior`

**Dashboard**
- `getDashboard()` → GET `/api/proxy/dashboard`

**Seed**
- `seedSampleData()` → POST `/api/proxy/seed`
- `resetSampleData()` → POST `/api/proxy/seed/reset`

**Billing**
- `getBillingPlan()` → GET `/api/proxy/billing/plan`
- `startCheckout()` → POST `/api/proxy/billing/checkout`
- `openBillingPortal()` → POST `/api/proxy/billing/portal`

---

## (d) Page list

kind: public (no auth chrome) | dashboard (wrapped by `web/app/dashboard/layout.tsx` → `DashboardLayout`).

1. `/` — `web/app/page.tsx` — public — static landing, no api. Marketing hero + feature grid + CTAs.
2. `/auth/sign-in` — `web/app/auth/sign-in/page.tsx` — public — client `authClient.signIn.email`. No api.* .
3. `/auth/sign-up` — `web/app/auth/sign-up/page.tsx` — public — client `authClient.signUp.email`. No api.* .
4. `/pricing` — `web/app/pricing/page.tsx` — public — static pricing (all free, Stripe optional). No api.* .
5. `/dashboard` — `web/app/dashboard/page.tsx` — dashboard — uses `getDashboard`, `getUpcomingDeadlines`. Renders KPI cards (open letters, breaches, savings YTD), deadlines, activity feed.
6. `/dashboard/letters` — `web/app/dashboard/letters/page.tsx` — dashboard — uses `getLetters`, `getSuppliers`. Filterable letters table by status/supplier.
7. `/dashboard/letters/new` — `web/app/dashboard/letters/new/page.tsx` — dashboard — uses `getSuppliers`, `getContracts`, `createLetter`, `addLineItem`. New letter form with line items.
8. `/dashboard/letters/[id]` — `web/app/dashboard/letters/[id]/page.tsx` — dashboard — uses `getLetter`, `getLineItems`, `addLineItem`, `deleteLineItem`, `runClauseChecks`, `getClauseChecks`, `runIndexValidation`, `getIndexValidations`, `computeCreep`, `getCreep`, `setLetterStatus`, `getComments`, `addComment`, `modelScenarios`, `getScenarios`, `generatePacket`, `createApproval`. Letter workspace: analysis tabs, comments, generate packet.
9. `/dashboard/suppliers` — `web/app/dashboard/suppliers/page.tsx` — dashboard — uses `getSuppliers`, `getCategories`, `createSupplier`, `deleteSupplier`. Suppliers list with scorecards.
10. `/dashboard/suppliers/[id]` — `web/app/dashboard/suppliers/[id]/page.tsx` — dashboard — uses `getSupplier`, `getSupplierScorecard`, `getSupplierLetters`, `updateSupplier`. Supplier profile + history.
11. `/dashboard/contracts` — `web/app/dashboard/contracts/page.tsx` — dashboard — uses `getContracts`, `getSuppliers`, `createContract`, `deleteContract`. Contracts list.
12. `/dashboard/contracts/[id]` — `web/app/dashboard/contracts/[id]/page.tsx` — dashboard — uses `getContract`, `getClauses`, `createClause`, `updateClause`, `deleteClause`, `computeCreep`, `getCreep`, `getIndices`. Contract + clause editor + creep timeline.
13. `/dashboard/indices` — `web/app/dashboard/indices/page.tsx` — dashboard — uses `getIndices`, `createIndex`, `updateIndex`, `deleteIndex`, `getIndexData`, `addIndexData`, `importIndexData`, `deleteIndexData`. Index library + data points.
14. `/dashboard/packets` — `web/app/dashboard/packets/page.tsx` — dashboard — uses `getPackets`, `getLetters`. Packets list.
15. `/dashboard/packets/[id]` — `web/app/dashboard/packets/[id]/page.tsx` — dashboard — uses `getPacket`, `updatePacket`, `addPacketSection`, `updatePacketSection`, `deletePacketSection`, `getTemplates`. Packet builder/editor.
16. `/dashboard/templates` — `web/app/dashboard/templates/page.tsx` — dashboard — uses `getTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`. Rebuttal template library.
17. `/dashboard/approvals` — `web/app/dashboard/approvals/page.tsx` — dashboard — uses `getApprovals`, `getApproval`, `decideApproval`, `deleteApproval`. Approval queue.
18. `/dashboard/scenarios` — `web/app/dashboard/scenarios/page.tsx` — dashboard — uses `getLetters`, `modelScenarios`, `getScenarios`, `createScenario`, `deleteScenario`. Counter-offer modeling.
19. `/dashboard/baselines` — `web/app/dashboard/baselines/page.tsx` — dashboard — uses `getBaselines`, `getSuppliers`, `getCategories`, `createBaseline`, `updateBaseline`, `deleteBaseline`. Spend baselines.
20. `/dashboard/deadlines` — `web/app/dashboard/deadlines/page.tsx` — dashboard — uses `getDeadlines`, `getUpcomingDeadlines`, `createDeadline`, `updateDeadline`, `deleteDeadline`. Deadlines calendar/list.
21. `/dashboard/categories` — `web/app/dashboard/categories/page.tsx` — dashboard — uses `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`. Category taxonomy.
22. `/dashboard/playbooks` — `web/app/dashboard/playbooks/page.tsx` — dashboard — uses `getPlaybooks`, `getCategories`, `createPlaybook`, `updatePlaybook`, `deletePlaybook`. Decision playbooks.
23. `/dashboard/reports` — `web/app/dashboard/reports/page.tsx` — dashboard — uses `getSavingsReport`, `getInflationWaveReport`, `getSupplierBehaviorReport`. Reporting & exports.
24. `/dashboard/notifications` — `web/app/dashboard/notifications/page.tsx` — dashboard — uses `getNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`. Notifications.
25. `/dashboard/audit` — `web/app/dashboard/audit/page.tsx` — dashboard — uses `getAudit`. Audit trail viewer.
26. `/dashboard/settings` — `web/app/dashboard/settings/page.tsx` — dashboard — uses `getWorkspace`, `updateWorkspace`, `getBillingPlan`, `startCheckout`, `openBillingPortal`, `seedSampleData`, `resetSampleData`. Workspace settings, sample data, billing.

Plus route handlers: `web/app/api/auth/[...path]/route.ts`, `web/app/api/proxy/[...path]/route.ts`.

Documents/snippets (`getDocuments`/`createDocument`/etc.) are surfaced inline on the letter detail (8) and contract detail (12) pages via an attachments/snippets panel; `recordAudit` is called by mutating flows (status changes, approvals) on the letter detail page.

---

## (e) DashboardLayout sidebar nav

`web/components/DashboardLayout.tsx` — `'use client'`, `<aside>` sidebar, active state via `usePathname()`, mobile drawer. Sections:

- **Overview**
  - Dashboard → `/dashboard`
- **Increases**
  - Letters → `/dashboard/letters`
  - Packets → `/dashboard/packets`
  - Scenarios → `/dashboard/scenarios`
  - Approvals → `/dashboard/approvals`
- **Agreements**
  - Suppliers → `/dashboard/suppliers`
  - Contracts → `/dashboard/contracts`
  - Categories → `/dashboard/categories`
- **Data & Rules**
  - Indices → `/dashboard/indices`
  - Baselines → `/dashboard/baselines`
  - Templates → `/dashboard/templates`
  - Playbooks → `/dashboard/playbooks`
- **Track**
  - Deadlines → `/dashboard/deadlines`
  - Reports → `/dashboard/reports`
  - Notifications → `/dashboard/notifications`
  - Audit → `/dashboard/audit`
- **Account**
  - Settings → `/dashboard/settings`

---

## Consistency notes (binding)

- Every api method maps to exactly one backend endpoint; every backend endpoint is consumed by at least one page (or by the proxy/auth layer for billing/webhook).
- ID style: `text('id').primaryKey().$defaultFn(() => crypto.randomUUID())` everywhere except `plans.id` (text seed 'free'/'pro').
- Money in integer cents; percents in `real`.
- Billing: webhook-inspector pattern — `plans` (text id) + `subscriptions` (text plan_id), Stripe-optional 503; seed plans 'free' and 'pro' in `seedIfEmpty()`.
- `seedIfEmpty()` in `index.ts` seeds `plans`; per-workspace sample data is created on demand via `/seed`.
- Backend boot must call `await migrate()` (from `db/migrate.ts`) before `seedIfEmpty()` so a fresh Neon DB self-provisions.
