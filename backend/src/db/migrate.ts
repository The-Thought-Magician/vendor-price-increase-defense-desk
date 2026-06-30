import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    default_currency text NOT NULL DEFAULT 'USD',
    approval_threshold_cents integer NOT NULL DEFAULT 0,
    contest_over_ask_pct real NOT NULL DEFAULT 1,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS categories (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    parent_id text,
    description text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS suppliers (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    category_id text REFERENCES categories(id),
    contact_name text DEFAULT '',
    contact_email text DEFAULT '',
    annual_spend_cents integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'active',
    notes text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS contracts (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    supplier_id text NOT NULL REFERENCES suppliers(id),
    name text NOT NULL,
    reference_number text DEFAULT '',
    currency text NOT NULL DEFAULT 'USD',
    effective_date timestamptz,
    term_end_date timestamptz,
    version integer NOT NULL DEFAULT 1,
    governing_entity text DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    notes text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS contract_clauses (
    id text PRIMARY KEY,
    contract_id text NOT NULL REFERENCES contracts(id),
    user_id text NOT NULL,
    clause_type text NOT NULL,
    title text NOT NULL,
    citation_text text DEFAULT '',
    cap_pct real,
    cumulative_cap_pct real,
    notice_days integer,
    fixed_start_date timestamptz,
    fixed_end_date timestamptz,
    index_id text,
    index_basket jsonb DEFAULT '[]'::jsonb,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS indices (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    source text DEFAULT '',
    unit text DEFAULT 'index',
    description text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS index_data_points (
    id text PRIMARY KEY,
    index_id text NOT NULL REFERENCES indices(id),
    user_id text NOT NULL,
    period text NOT NULL,
    value real NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (index_id, period)
  )`,

  `CREATE TABLE IF NOT EXISTS increase_letters (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    supplier_id text NOT NULL REFERENCES suppliers(id),
    contract_id text REFERENCES contracts(id),
    title text NOT NULL,
    proposed_pct real,
    effective_date timestamptz,
    received_date timestamptz,
    justification text DEFAULT '',
    raw_text text DEFAULT '',
    sender_contact text DEFAULT '',
    status text NOT NULL DEFAULT 'logged',
    defensibility_score real,
    aggregate_verdict text,
    annual_impact_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS letter_line_items (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    user_id text NOT NULL,
    sku text DEFAULT '',
    description text NOT NULL,
    current_price_cents integer NOT NULL DEFAULT 0,
    proposed_price_cents integer NOT NULL DEFAULT 0,
    proposed_pct real,
    annual_volume integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS clause_checks (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    clause_id text REFERENCES contract_clauses(id),
    user_id text NOT NULL,
    clause_type text NOT NULL,
    verdict text NOT NULL,
    severity text NOT NULL DEFAULT 'low',
    detail text DEFAULT '',
    citation_text text DEFAULT '',
    expected_value real,
    actual_value real,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS index_validations (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    user_id text NOT NULL,
    index_id text REFERENCES indices(id),
    claimed_pct real,
    base_period text DEFAULT '',
    current_period text DEFAULT '',
    base_value real,
    current_value real,
    actual_pct real,
    entitled_pct real,
    over_ask_pct real,
    basket jsonb DEFAULT '[]'::jsonb,
    detail text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS cumulative_creep_records (
    id text PRIMARY KEY,
    contract_id text NOT NULL REFERENCES contracts(id),
    letter_id text REFERENCES increase_letters(id),
    user_id text NOT NULL,
    cumulative_pct real NOT NULL DEFAULT 0,
    cap_pct real,
    breached boolean NOT NULL DEFAULT false,
    timeline jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS pushback_packets (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    title text NOT NULL,
    tone text NOT NULL DEFAULT 'firm',
    recommended_counter_pct real,
    body text DEFAULT '',
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS packet_sections (
    id text PRIMARY KEY,
    packet_id text NOT NULL REFERENCES pushback_packets(id),
    user_id text NOT NULL,
    section_type text NOT NULL,
    heading text NOT NULL,
    content text DEFAULT '',
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS rebuttal_templates (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    breach_type text NOT NULL,
    tone text NOT NULL DEFAULT 'firm',
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS approvals (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    letter_id text NOT NULL REFERENCES increase_letters(id),
    user_id text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    decision_note text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS approval_steps (
    id text PRIMARY KEY,
    approval_id text NOT NULL REFERENCES approvals(id),
    user_id text NOT NULL,
    step_order integer NOT NULL DEFAULT 0,
    role text NOT NULL DEFAULT 'reviewer',
    status text NOT NULL DEFAULT 'pending',
    decided_by text DEFAULT '',
    decided_at timestamptz,
    note text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS audit_events (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    actor text DEFAULT '',
    detail jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS comments (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    user_id text NOT NULL,
    author text DEFAULT '',
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS spend_baselines (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    supplier_id text REFERENCES suppliers(id),
    category_id text REFERENCES categories(id),
    period text NOT NULL,
    annual_spend_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS counter_scenarios (
    id text PRIMARY KEY,
    letter_id text NOT NULL REFERENCES increase_letters(id),
    user_id text NOT NULL,
    name text NOT NULL,
    scenario_type text NOT NULL,
    applied_pct real,
    annual_impact_cents integer NOT NULL DEFAULT 0,
    is_recommended boolean NOT NULL DEFAULT false,
    detail text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS supplier_scorecards (
    id text PRIMARY KEY,
    supplier_id text NOT NULL REFERENCES suppliers(id) UNIQUE,
    user_id text NOT NULL,
    total_letters integer NOT NULL DEFAULT 0,
    contests_won integer NOT NULL DEFAULT 0,
    avg_over_ask_pct real NOT NULL DEFAULT 0,
    behavior_score real NOT NULL DEFAULT 0,
    total_avoided_cents integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS deadlines (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    letter_id text REFERENCES increase_letters(id),
    contract_id text REFERENCES contracts(id),
    kind text NOT NULL DEFAULT 'response',
    title text NOT NULL,
    due_date timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS playbooks (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    name text NOT NULL,
    category_id text REFERENCES categories(id),
    contest_over_ask_pct real NOT NULL DEFAULT 1,
    auto_accept_within_index boolean NOT NULL DEFAULT true,
    auto_accept_under_cap boolean NOT NULL DEFAULT true,
    rules jsonb DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text DEFAULT '',
    link text DEFAULT '',
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS documents (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    letter_id text REFERENCES increase_letters(id),
    contract_id text REFERENCES contracts(id),
    name text NOT NULL,
    doc_type text NOT NULL DEFAULT 'attachment',
    content text DEFAULT '',
    url text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id),
    user_id text NOT NULL,
    action text NOT NULL,
    entity_type text DEFAULT '',
    entity_id text DEFAULT '',
    summary text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free' REFERENCES plans(id),
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexStatements: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_categories_workspace ON categories(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON suppliers(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_workspace ON contracts(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clauses_contract ON contract_clauses(contract_id)`,
  `CREATE INDEX IF NOT EXISTS idx_indices_workspace ON indices(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_index_data_index ON index_data_points(index_id)`,
  `CREATE INDEX IF NOT EXISTS idx_letters_workspace ON increase_letters(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_letters_supplier ON increase_letters(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_letters_contract ON increase_letters(contract_id)`,
  `CREATE INDEX IF NOT EXISTS idx_line_items_letter ON letter_line_items(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_clause_checks_letter ON clause_checks(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_index_validations_letter ON index_validations(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_creep_contract ON cumulative_creep_records(contract_id)`,
  `CREATE INDEX IF NOT EXISTS idx_packets_letter ON pushback_packets(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_packets_workspace ON pushback_packets(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_packet_sections_packet ON packet_sections(packet_id)`,
  `CREATE INDEX IF NOT EXISTS idx_templates_workspace ON rebuttal_templates(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_letter ON approvals(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approval_steps_approval ON approval_steps(approval_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_events(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_letter ON comments(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_baselines_workspace ON spend_baselines(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scenarios_letter ON counter_scenarios(letter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scorecards_supplier ON supplier_scorecards(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deadlines_workspace ON deadlines(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_playbooks_workspace ON playbooks(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity_log(workspace_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const stmt of indexStatements) {
    await db.execute(sql.raw(stmt))
  }
  console.log('Migration complete')
}
