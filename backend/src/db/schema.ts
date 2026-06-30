import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Core / workspace
// ---------------------------------------------------------------------------

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  default_currency: text('default_currency').notNull().default('USD'),
  approval_threshold_cents: integer('approval_threshold_cents').notNull().default(0),
  contest_over_ask_pct: real('contest_over_ask_pct').notNull().default(1),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const categories = pgTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  parent_id: text('parent_id'),
  description: text('description').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  category_id: text('category_id').references(() => categories.id),
  contact_name: text('contact_name').default(''),
  contact_email: text('contact_email').default(''),
  annual_spend_cents: integer('annual_spend_cents').notNull().default(0),
  status: text('status').notNull().default('active'),
  notes: text('notes').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Contracts & clauses
// ---------------------------------------------------------------------------

export const contracts = pgTable('contracts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  supplier_id: text('supplier_id').notNull().references(() => suppliers.id),
  name: text('name').notNull(),
  reference_number: text('reference_number').default(''),
  currency: text('currency').notNull().default('USD'),
  effective_date: timestamp('effective_date'),
  term_end_date: timestamp('term_end_date'),
  version: integer('version').notNull().default(1),
  governing_entity: text('governing_entity').default(''),
  status: text('status').notNull().default('active'),
  notes: text('notes').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const contract_clauses = pgTable('contract_clauses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contract_id: text('contract_id').notNull().references(() => contracts.id),
  user_id: text('user_id').notNull(),
  clause_type: text('clause_type').notNull(), // annual_cap | fixed_price_period | indexation | notice_window | cumulative_cap | mfn | price_protection
  title: text('title').notNull(),
  citation_text: text('citation_text').default(''),
  cap_pct: real('cap_pct'),
  cumulative_cap_pct: real('cumulative_cap_pct'),
  notice_days: integer('notice_days'),
  fixed_start_date: timestamp('fixed_start_date'),
  fixed_end_date: timestamp('fixed_end_date'),
  index_id: text('index_id'),
  index_basket: jsonb('index_basket').$type<Array<{ index_id: string; weight: number }>>().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Indices
// ---------------------------------------------------------------------------

export const indices = pgTable('indices', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  source: text('source').default(''),
  unit: text('unit').default('index'),
  description: text('description').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const index_data_points = pgTable('index_data_points', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  index_id: text('index_id').notNull().references(() => indices.id),
  user_id: text('user_id').notNull(),
  period: text('period').notNull(), // e.g. 2025-01
  value: real('value').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.index_id, t.period)])

// ---------------------------------------------------------------------------
// Increase letters
// ---------------------------------------------------------------------------

export const increase_letters = pgTable('increase_letters', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  supplier_id: text('supplier_id').notNull().references(() => suppliers.id),
  contract_id: text('contract_id').references(() => contracts.id),
  title: text('title').notNull(),
  proposed_pct: real('proposed_pct'),
  effective_date: timestamp('effective_date'),
  received_date: timestamp('received_date'),
  justification: text('justification').default(''),
  raw_text: text('raw_text').default(''),
  sender_contact: text('sender_contact').default(''),
  status: text('status').notNull().default('logged'), // draft|logged|under_review|packet_ready|sent|accepted|contested|withdrawn|resolved
  defensibility_score: real('defensibility_score'),
  aggregate_verdict: text('aggregate_verdict'), // compliant|partial|breach
  annual_impact_cents: integer('annual_impact_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const letter_line_items = pgTable('letter_line_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  sku: text('sku').default(''),
  description: text('description').notNull(),
  current_price_cents: integer('current_price_cents').notNull().default(0),
  proposed_price_cents: integer('proposed_price_cents').notNull().default(0),
  proposed_pct: real('proposed_pct'),
  annual_volume: integer('annual_volume').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Analysis: clause checks, index validations, cumulative creep
// ---------------------------------------------------------------------------

export const clause_checks = pgTable('clause_checks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  clause_id: text('clause_id').references(() => contract_clauses.id),
  user_id: text('user_id').notNull(),
  clause_type: text('clause_type').notNull(),
  verdict: text('verdict').notNull(), // compliant|partial|breach
  severity: text('severity').notNull().default('low'), // low|medium|high
  detail: text('detail').default(''),
  citation_text: text('citation_text').default(''),
  expected_value: real('expected_value'),
  actual_value: real('actual_value'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const index_validations = pgTable('index_validations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  index_id: text('index_id').references(() => indices.id),
  claimed_pct: real('claimed_pct'),
  base_period: text('base_period').default(''),
  current_period: text('current_period').default(''),
  base_value: real('base_value'),
  current_value: real('current_value'),
  actual_pct: real('actual_pct'),
  entitled_pct: real('entitled_pct'),
  over_ask_pct: real('over_ask_pct'),
  basket: jsonb('basket').$type<Array<{ index_id: string; weight: number; pct: number }>>().default([]),
  detail: text('detail').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const cumulative_creep_records = pgTable('cumulative_creep_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  contract_id: text('contract_id').notNull().references(() => contracts.id),
  letter_id: text('letter_id').references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  cumulative_pct: real('cumulative_pct').notNull().default(0),
  cap_pct: real('cap_pct'),
  breached: boolean('breached').notNull().default(false),
  timeline: jsonb('timeline').$type<Array<{ date: string; pct: number; cumulative: number }>>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Pushback packets & templates
// ---------------------------------------------------------------------------

export const pushback_packets = pgTable('pushback_packets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  title: text('title').notNull(),
  tone: text('tone').notNull().default('firm'), // firm|collaborative|escalation
  recommended_counter_pct: real('recommended_counter_pct'),
  body: text('body').default(''),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft|final|sent
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const packet_sections = pgTable('packet_sections', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  packet_id: text('packet_id').notNull().references(() => pushback_packets.id),
  user_id: text('user_id').notNull(),
  section_type: text('section_type').notNull(), // summary|clause|index|creep|counter|custom
  heading: text('heading').notNull(),
  content: text('content').default(''),
  position: integer('position').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const rebuttal_templates = pgTable('rebuttal_templates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  breach_type: text('breach_type').notNull(), // over_cap|index_over_ask|fixed_price|insufficient_notice|cumulative
  tone: text('tone').notNull().default('firm'),
  body: text('body').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Approvals, audit, comments
// ---------------------------------------------------------------------------

export const approvals = pgTable('approvals', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  status: text('status').notNull().default('pending'), // pending|approved|rejected
  decision_note: text('decision_note').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

export const approval_steps = pgTable('approval_steps', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  approval_id: text('approval_id').notNull().references(() => approvals.id),
  user_id: text('user_id').notNull(),
  step_order: integer('step_order').notNull().default(0),
  role: text('role').notNull().default('reviewer'), // reviewer|approver
  status: text('status').notNull().default('pending'),
  decided_by: text('decided_by').default(''),
  decided_at: timestamp('decided_at'),
  note: text('note').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const audit_events = pgTable('audit_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  action: text('action').notNull(),
  actor: text('actor').default(''),
  detail: jsonb('detail').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const comments = pgTable('comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  author: text('author').default(''),
  body: text('body').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Baselines, scenarios, scorecards
// ---------------------------------------------------------------------------

export const spend_baselines = pgTable('spend_baselines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  supplier_id: text('supplier_id').references(() => suppliers.id),
  category_id: text('category_id').references(() => categories.id),
  period: text('period').notNull(),
  annual_spend_cents: integer('annual_spend_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const counter_scenarios = pgTable('counter_scenarios', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  letter_id: text('letter_id').notNull().references(() => increase_letters.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  scenario_type: text('scenario_type').notNull(), // accept_as_is|accept_capped|accept_indexed|reject
  applied_pct: real('applied_pct'),
  annual_impact_cents: integer('annual_impact_cents').notNull().default(0),
  is_recommended: boolean('is_recommended').notNull().default(false),
  detail: text('detail').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const supplier_scorecards = pgTable('supplier_scorecards', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  supplier_id: text('supplier_id').notNull().references(() => suppliers.id).unique(),
  user_id: text('user_id').notNull(),
  total_letters: integer('total_letters').notNull().default(0),
  contests_won: integer('contests_won').notNull().default(0),
  avg_over_ask_pct: real('avg_over_ask_pct').notNull().default(0),
  behavior_score: real('behavior_score').notNull().default(0),
  total_avoided_cents: integer('total_avoided_cents').notNull().default(0),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Deadlines, playbooks, notifications, documents, activity
// ---------------------------------------------------------------------------

export const deadlines = pgTable('deadlines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  letter_id: text('letter_id').references(() => increase_letters.id),
  contract_id: text('contract_id').references(() => contracts.id),
  kind: text('kind').notNull().default('response'), // response|notice|effective|sla
  title: text('title').notNull(),
  due_date: timestamp('due_date').notNull(),
  status: text('status').notNull().default('open'), // open|done|overdue
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const playbooks = pgTable('playbooks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  category_id: text('category_id').references(() => categories.id),
  contest_over_ask_pct: real('contest_over_ask_pct').notNull().default(1),
  auto_accept_within_index: boolean('auto_accept_within_index').notNull().default(true),
  auto_accept_under_cap: boolean('auto_accept_under_cap').notNull().default(true),
  rules: jsonb('rules').$type<Array<{ condition: string; action: string }>>().default([]),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  type: text('type').notNull(), // letter_logged|breach|deadline|packet_ready|approval_requested
  title: text('title').notNull(),
  body: text('body').default(''),
  link: text('link').default(''),
  read: boolean('read').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const documents = pgTable('documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  letter_id: text('letter_id').references(() => increase_letters.id),
  contract_id: text('contract_id').references(() => contracts.id),
  name: text('name').notNull(),
  doc_type: text('doc_type').notNull().default('attachment'), // attachment|snippet
  content: text('content').default(''),
  url: text('url').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const activity_log = pgTable('activity_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id),
  user_id: text('user_id').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').default(''),
  entity_id: text('entity_id').default(''),
  summary: text('summary').default(''),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// ---------------------------------------------------------------------------
// Billing (webhook-inspector pattern: text plan ids 'free'/'pro')
// ---------------------------------------------------------------------------

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free').references(() => plans.id),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').notNull().default('active'),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
