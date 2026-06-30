import { Hono } from 'hono'
import { db } from '../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'
import {
  workspaces,
  categories,
  suppliers,
  contracts,
  contract_clauses,
  indices,
  index_data_points,
  increase_letters,
  letter_line_items,
  clause_checks,
  index_validations,
  cumulative_creep_records,
  pushback_packets,
  packet_sections,
  rebuttal_templates,
  approvals,
  approval_steps,
  audit_events,
  comments,
  spend_baselines,
  counter_scenarios,
  supplier_scorecards,
  deadlines,
  playbooks,
  notifications,
  documents,
  activity_log,
} from '../db/schema.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Workspace resolution — find or create the current user's workspace.
// Mirrors the auto-create behaviour of GET /workspaces/current so seeding can
// always target a real, owned workspace.
// ---------------------------------------------------------------------------

async function getOrCreateWorkspace(userId: string) {
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(workspaces)
    .values({
      user_id: userId,
      name: 'My Workspace',
      default_currency: 'USD',
      approval_threshold_cents: 5_000_000,
      contest_over_ask_pct: 1,
    })
    .returning()
  return created
}

// ---------------------------------------------------------------------------
// Date helpers — produce deterministic timestamps relative to "now".
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000)
}
function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000)
}

/** Build a monotonically increasing series of monthly index points. */
function monthlySeries(start: number, count: number, monthlyStepPct: number) {
  const points: Array<{ period: string; value: number }> = []
  let value = start
  // anchor the most recent point at the current month, walking backwards
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    points.push({ period, value: Math.round(value * 1000) / 1000 })
    value = value * (1 + monthlyStepPct / 100)
  }
  return points
}

function pctBetween(base: number, current: number): number {
  if (!base) return 0
  return Math.round(((current - base) / base) * 1000) / 10
}

// ---------------------------------------------------------------------------
// POST /  — seed realistic sample data for the current workspace.
// Idempotent-ish: clears prior sample data first so re-seeding is safe.
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const ws = await getOrCreateWorkspace(userId)
  const workspaceId = ws.id

  await clearWorkspaceData(workspaceId, userId)

  // --- Categories -----------------------------------------------------------
  const [catPackaging] = await db
    .insert(categories)
    .values({ workspace_id: workspaceId, user_id: userId, name: 'Packaging', description: 'Cartons, films, and protective packaging' })
    .returning()
  const [catLogistics] = await db
    .insert(categories)
    .values({ workspace_id: workspaceId, user_id: userId, name: 'Logistics & Freight', description: 'Carriers, parcel, and warehousing' })
    .returning()
  const [catSaaS] = await db
    .insert(categories)
    .values({ workspace_id: workspaceId, user_id: userId, name: 'SaaS & Software', description: 'Subscriptions and seat-based tooling' })
    .returning()
  const [catRaw] = await db
    .insert(categories)
    .values({ workspace_id: workspaceId, user_id: userId, name: 'Raw Materials', description: 'Resins, metals, and commodity inputs' })
    .returning()

  // --- Indices + data points -------------------------------------------------
  const [idxPPI] = await db
    .insert(indices)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      code: 'PPI-PKG',
      name: 'PPI: Paperboard Containers',
      source: 'US BLS',
      unit: 'index',
      description: 'Producer Price Index for paperboard container manufacturing',
    })
    .returning()
  const [idxFuel] = await db
    .insert(indices)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      code: 'DIESEL-US',
      name: 'US On-Highway Diesel Price',
      source: 'US EIA',
      unit: 'usd_per_gal',
      description: 'National average retail diesel fuel price',
    })
    .returning()
  const [idxCPI] = await db
    .insert(indices)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      code: 'CPI-U',
      name: 'CPI for All Urban Consumers',
      source: 'US BLS',
      unit: 'index',
      description: 'Headline consumer price index',
    })
    .returning()
  const [idxResin] = await db
    .insert(indices)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      code: 'RESIN-PE',
      name: 'Polyethylene Resin Spot',
      source: 'PlasticsExchange',
      unit: 'usd_per_lb',
      description: 'Spot price for polyethylene resin',
    })
    .returning()

  // 18 months of data per index, with realistic per-index drift.
  const seriesByIndex: Array<{ index: typeof idxPPI; series: ReturnType<typeof monthlySeries> }> = [
    { index: idxPPI, series: monthlySeries(118.0, 18, 0.45) },
    { index: idxFuel, series: monthlySeries(3.6, 18, 0.6) },
    { index: idxCPI, series: monthlySeries(305.0, 18, 0.3) },
    { index: idxResin, series: monthlySeries(0.72, 18, 0.5) },
  ]
  for (const { index, series } of seriesByIndex) {
    for (const p of series) {
      await db
        .insert(index_data_points)
        .values({ index_id: index.id, user_id: userId, period: p.period, value: p.value })
        .onConflictDoUpdate({
          target: [index_data_points.index_id, index_data_points.period],
          set: { value: p.value },
        })
    }
  }

  function indexPct(index: typeof idxPPI, basePeriod: string, currentPeriod: string) {
    const all = seriesByIndex.find((s) => s.index.id === index.id)!.series
    const base = all.find((p) => p.period === basePeriod)?.value ?? all[0].value
    const cur = all.find((p) => p.period === currentPeriod)?.value ?? all[all.length - 1].value
    return { base, cur, pct: pctBetween(base, cur), basePeriod, currentPeriod }
  }
  const basePeriod = seriesByIndex[0].series[0].period
  const currentPeriod = seriesByIndex[0].series[seriesByIndex[0].series.length - 1].period

  // --- Suppliers -------------------------------------------------------------
  const [supAcme] = await db
    .insert(suppliers)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Acme Packaging Co.',
      category_id: catPackaging.id,
      contact_name: 'Dana Holt',
      contact_email: 'dana.holt@acmepkg.example',
      annual_spend_cents: 240_000_00,
      status: 'active',
      notes: 'Primary corrugated supplier; long-term MSA in place.',
    })
    .returning()
  const [supSwift] = await db
    .insert(suppliers)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: 'SwiftFreight Logistics',
      category_id: catLogistics.id,
      contact_name: 'Marco Ruiz',
      contact_email: 'marco@swiftfreight.example',
      annual_spend_cents: 980_000_00,
      status: 'active',
      notes: 'Regional LTL carrier; fuel-surcharge heavy.',
    })
    .returning()
  const [supNimbus] = await db
    .insert(suppliers)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Nimbus Cloud Tools',
      category_id: catSaaS.id,
      contact_name: 'Priya Nair',
      contact_email: 'priya@nimbustools.example',
      annual_spend_cents: 120_000_00,
      status: 'active',
      notes: 'Seat-based analytics platform; annual renewal in Q3.',
    })
    .returning()
  const [supPolymer] = await db
    .insert(suppliers)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Polymer Direct',
      category_id: catRaw.id,
      contact_name: 'Leah Chen',
      contact_email: 'leah@polymerdirect.example',
      annual_spend_cents: 540_000_00,
      status: 'active',
      notes: 'Resin and film stock; index-linked agreement.',
    })
    .returning()

  // --- Contracts -------------------------------------------------------------
  const [conAcme] = await db
    .insert(contracts)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supAcme.id,
      name: 'Acme Master Supply Agreement',
      reference_number: 'MSA-ACME-2023',
      currency: 'USD',
      effective_date: daysAgo(540),
      term_end_date: daysFromNow(360),
      version: 2,
      governing_entity: 'Acme Packaging Co. (DE)',
      status: 'active',
      notes: 'Includes annual cap and cumulative cap protections.',
    })
    .returning()
  const [conSwift] = await db
    .insert(contracts)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supSwift.id,
      name: 'SwiftFreight Carrier Agreement',
      reference_number: 'CA-SWIFT-2024',
      currency: 'USD',
      effective_date: daysAgo(300),
      term_end_date: daysFromNow(430),
      version: 1,
      governing_entity: 'SwiftFreight Logistics LLC',
      status: 'active',
      notes: 'Fuel surcharge indexed to diesel; 60-day notice required.',
    })
    .returning()
  const [conNimbus] = await db
    .insert(contracts)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supNimbus.id,
      name: 'Nimbus Subscription Order Form',
      reference_number: 'OF-NIMBUS-2024',
      currency: 'USD',
      effective_date: daysAgo(200),
      term_end_date: daysFromNow(165),
      version: 1,
      governing_entity: 'Nimbus Cloud Tools Inc.',
      status: 'active',
      notes: 'Fixed price for initial term; renewal uplift capped.',
    })
    .returning()
  const [conPolymer] = await db
    .insert(contracts)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supPolymer.id,
      name: 'Polymer Direct Indexed Supply',
      reference_number: 'ISA-POLY-2023',
      currency: 'USD',
      effective_date: daysAgo(420),
      term_end_date: daysFromNow(280),
      version: 3,
      governing_entity: 'Polymer Direct Corp.',
      status: 'active',
      notes: 'Price changes pegged to a resin/fuel basket.',
    })
    .returning()

  // --- Contract clauses ------------------------------------------------------
  const [clAcmeCap] = await db
    .insert(contract_clauses)
    .values({
      contract_id: conAcme.id,
      user_id: userId,
      clause_type: 'annual_cap',
      title: 'Annual Price Increase Cap',
      citation_text: 'Section 5.2: Supplier may increase prices no more than 5% in any twelve-month period.',
      cap_pct: 5,
      created_at: daysAgo(540),
    })
    .returning()
  const [clAcmeCumulative] = await db
    .insert(contract_clauses)
    .values({
      contract_id: conAcme.id,
      user_id: userId,
      clause_type: 'cumulative_cap',
      title: 'Cumulative Term Cap',
      citation_text: 'Section 5.4: Aggregate increases over the term shall not exceed 12%.',
      cumulative_cap_pct: 12,
      created_at: daysAgo(540),
    })
    .returning()
  const [clSwiftIndex] = await db
    .insert(contract_clauses)
    .values({
      contract_id: conSwift.id,
      user_id: userId,
      clause_type: 'indexation',
      title: 'Fuel Surcharge Indexation',
      citation_text: 'Exhibit B: Fuel surcharge adjusts in proportion to the EIA on-highway diesel index.',
      index_id: idxFuel.id,
      index_basket: [{ index_id: idxFuel.id, weight: 1 }],
      created_at: daysAgo(300),
    })
    .returning()
  const [clSwiftNotice] = await db
    .insert(contract_clauses)
    .values({
      contract_id: conSwift.id,
      user_id: userId,
      clause_type: 'notice_window',
      title: 'Price Change Notice',
      citation_text: 'Section 7.1: Supplier shall provide at least 60 days written notice of any rate change.',
      notice_days: 60,
      created_at: daysAgo(300),
    })
    .returning()
  await db.insert(contract_clauses).values({
    contract_id: conNimbus.id,
    user_id: userId,
    clause_type: 'fixed_price_period',
    title: 'Initial Term Fixed Pricing',
    citation_text: 'Section 3.1: Subscription fees are fixed through the initial term end date.',
    fixed_start_date: daysAgo(200),
    fixed_end_date: daysFromNow(165),
    created_at: daysAgo(200),
  })
  const [clPolymerBasket] = await db
    .insert(contract_clauses)
    .values({
      contract_id: conPolymer.id,
      user_id: userId,
      clause_type: 'indexation',
      title: 'Resin/Fuel Basket Indexation',
      citation_text: 'Schedule 2: Price adjusts by the weighted change of the resin (70%) and diesel (30%) indices.',
      index_basket: [
        { index_id: idxResin.id, weight: 0.7 },
        { index_id: idxFuel.id, weight: 0.3 },
      ],
      created_at: daysAgo(420),
    })
    .returning()
  await db.insert(contract_clauses).values({
    contract_id: conPolymer.id,
    user_id: userId,
    clause_type: 'annual_cap',
    title: 'Annual Cap',
    citation_text: 'Schedule 2.3: No single annual adjustment shall exceed 8%.',
    cap_pct: 8,
    created_at: daysAgo(420),
  })

  // --- Rebuttal templates ----------------------------------------------------
  await db.insert(rebuttal_templates).values([
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Over-Cap Pushback (Firm)',
      breach_type: 'over_cap',
      tone: 'firm',
      body: 'The proposed increase of {{proposed_pct}}% exceeds the {{cap_pct}}% annual cap in {{citation}}. We can accept an adjustment up to the contractual cap and request a revised notice reflecting that figure.',
    },
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Index Over-Ask (Collaborative)',
      breach_type: 'index_over_ask',
      tone: 'collaborative',
      body: 'The {{index}} index supports an adjustment of {{entitled_pct}}%, yet the request is {{proposed_pct}}%. We value the partnership and propose settling at the index-entitled figure with a quarterly review.',
    },
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Insufficient Notice',
      breach_type: 'insufficient_notice',
      tone: 'firm',
      body: 'The agreement requires {{notice_days}} days written notice. The notice received does not satisfy this requirement; the proposed effective date is therefore not enforceable.',
    },
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Fixed-Price Period Breach',
      breach_type: 'fixed_price',
      tone: 'firm',
      body: 'Pricing is fixed through {{fixed_end_date}} under {{citation}}. No increase may take effect before that date.',
    },
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Cumulative Creep',
      breach_type: 'cumulative',
      tone: 'escalation',
      body: 'Cumulative increases now total {{cumulative_pct}}% against a {{cap_pct}}% term cap. We must reset to the capped level and reconcile prior adjustments.',
    },
  ])

  // --- Playbooks -------------------------------------------------------------
  await db.insert(playbooks).values([
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Default Contest Policy',
      category_id: null,
      contest_over_ask_pct: 1,
      auto_accept_within_index: true,
      auto_accept_under_cap: false,
      rules: [
        { condition: 'over_ask_pct > 1', action: 'contest' },
        { condition: 'within_index', action: 'auto_accept' },
      ],
      is_active: true,
    },
    {
      workspace_id: workspaceId,
      user_id: userId,
      name: 'Logistics Fuel Discipline',
      category_id: catLogistics.id,
      contest_over_ask_pct: 0.5,
      auto_accept_within_index: true,
      auto_accept_under_cap: true,
      rules: [{ condition: 'fuel_index_delta < proposed', action: 'contest' }],
      is_active: true,
    },
  ])

  // --- Spend baselines -------------------------------------------------------
  await db.insert(spend_baselines).values([
    { workspace_id: workspaceId, user_id: userId, supplier_id: supAcme.id, category_id: catPackaging.id, period: basePeriod, annual_spend_cents: 220_000_00 },
    { workspace_id: workspaceId, user_id: userId, supplier_id: supSwift.id, category_id: catLogistics.id, period: basePeriod, annual_spend_cents: 900_000_00 },
    { workspace_id: workspaceId, user_id: userId, supplier_id: supPolymer.id, category_id: catRaw.id, period: basePeriod, annual_spend_cents: 500_000_00 },
    { workspace_id: workspaceId, user_id: userId, supplier_id: supAcme.id, category_id: catPackaging.id, period: currentPeriod, annual_spend_cents: 240_000_00 },
  ])

  // ===========================================================================
  // Letters + downstream analysis
  // ===========================================================================

  // Letter 1: Acme — over the annual cap (breach), contested & won.
  const [letterAcme] = await db
    .insert(increase_letters)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supAcme.id,
      contract_id: conAcme.id,
      title: 'Acme 2025 Corrugated Price Adjustment',
      proposed_pct: 9,
      effective_date: daysFromNow(20),
      received_date: daysAgo(12),
      justification: 'Citing rising paperboard input costs and freight.',
      raw_text: 'Effective next quarter, list pricing on all corrugated SKUs will rise 9% to reflect sustained input cost inflation.',
      sender_contact: 'dana.holt@acmepkg.example',
      status: 'contested',
      annual_impact_cents: 0,
    })
    .returning()
  await db.insert(letter_line_items).values([
    { letter_id: letterAcme.id, user_id: userId, sku: 'BOX-RSC-12', description: 'RSC Box 12x10x8', current_price_cents: 84, proposed_price_cents: 92, proposed_pct: 9.5, annual_volume: 1_200_000 },
    { letter_id: letterAcme.id, user_id: userId, sku: 'BOX-RSC-18', description: 'RSC Box 18x12x10', current_price_cents: 132, proposed_price_cents: 144, proposed_pct: 9.1, annual_volume: 480_000 },
  ])
  // clause checks for Acme: annual cap breach (high), cumulative partial.
  await db.insert(clause_checks).values([
    {
      letter_id: letterAcme.id,
      clause_id: clAcmeCap.id,
      user_id: userId,
      clause_type: 'annual_cap',
      verdict: 'breach',
      severity: 'high',
      detail: 'Proposed 9% exceeds the 5% annual cap by 4 percentage points.',
      citation_text: clAcmeCap.citation_text ?? '',
      expected_value: 5,
      actual_value: 9,
    },
    {
      letter_id: letterAcme.id,
      clause_id: clAcmeCumulative.id,
      user_id: userId,
      clause_type: 'cumulative_cap',
      verdict: 'partial',
      severity: 'medium',
      detail: 'Combined with prior adjustments, cumulative reaches ~11.5% against a 12% term cap.',
      citation_text: clAcmeCumulative.citation_text ?? '',
      expected_value: 12,
      actual_value: 11.5,
    },
  ])
  // creep record for Acme contract
  await db.insert(cumulative_creep_records).values({
    contract_id: conAcme.id,
    letter_id: letterAcme.id,
    user_id: userId,
    cumulative_pct: 11.5,
    cap_pct: 12,
    breached: false,
    timeline: [
      { date: daysAgo(400).toISOString(), pct: 2.5, cumulative: 2.5 },
      { date: daysAgo(40).toISOString(), pct: 4, cumulative: 6.6 },
      { date: daysFromNow(20).toISOString(), pct: 9, cumulative: 11.5 },
    ],
  })
  // index validation not relevant for Acme (no index clause) — skipped.
  // counter scenarios for Acme: accept_as_is / accept_capped (recommended) / reject
  const acmeAnnualBase = 84 * 1_200_000 + 132 * 480_000 // current annual cents
  await db.insert(counter_scenarios).values([
    {
      letter_id: letterAcme.id,
      user_id: userId,
      name: 'Accept as proposed (9%)',
      scenario_type: 'accept_as_is',
      applied_pct: 9,
      annual_impact_cents: Math.round(acmeAnnualBase * 0.09),
      is_recommended: false,
      detail: 'Full pass-through of the requested increase.',
    },
    {
      letter_id: letterAcme.id,
      user_id: userId,
      name: 'Hold to contractual cap (5%)',
      scenario_type: 'accept_capped',
      applied_pct: 5,
      annual_impact_cents: Math.round(acmeAnnualBase * 0.05),
      is_recommended: true,
      detail: 'Enforce the 5% annual cap in Section 5.2; avoids 4 points of over-ask.',
    },
    {
      letter_id: letterAcme.id,
      user_id: userId,
      name: 'Reject and hold pricing',
      scenario_type: 'reject',
      applied_pct: 0,
      annual_impact_cents: 0,
      is_recommended: false,
      detail: 'Decline pending renegotiation; risk of supply friction.',
    },
  ])
  // recompute Acme letter rollups
  const acmeImpact = Math.round(acmeAnnualBase * 0.05)
  await db
    .update(increase_letters)
    .set({ aggregate_verdict: 'breach', defensibility_score: 32, annual_impact_cents: acmeImpact, updated_at: new Date() })
    .where(eq(increase_letters.id, letterAcme.id))

  // pushback packet for Acme
  const [packetAcme] = await db
    .insert(pushback_packets)
    .values({
      letter_id: letterAcme.id,
      workspace_id: workspaceId,
      user_id: userId,
      title: 'Pushback: Acme 2025 Adjustment',
      tone: 'firm',
      recommended_counter_pct: 5,
      body: 'Our analysis finds the proposed 9% increase exceeds the 5% annual cap under MSA Section 5.2.',
      version: 1,
      status: 'final',
    })
    .returning()
  await db.insert(packet_sections).values([
    { packet_id: packetAcme.id, user_id: userId, section_type: 'summary', heading: 'Summary', content: 'Requested 9% vs. 5% contractual cap. We propose settling at 5%.', position: 0 },
    { packet_id: packetAcme.id, user_id: userId, section_type: 'clause', heading: 'Annual Cap Breach', content: clAcmeCap.citation_text ?? '', position: 1 },
    { packet_id: packetAcme.id, user_id: userId, section_type: 'counter', heading: 'Recommended Counter', content: 'Accept 5%; reconcile against cumulative term cap of 12%.', position: 2 },
  ])
  // approval for Acme
  const [apprAcme] = await db
    .insert(approvals)
    .values({ workspace_id: workspaceId, letter_id: letterAcme.id, user_id: userId, status: 'approved', decision_note: 'Approved counter at 5%.' })
    .returning()
  await db.insert(approval_steps).values([
    { approval_id: apprAcme.id, user_id: userId, step_order: 0, role: 'reviewer', status: 'approved', decided_by: userId, decided_at: daysAgo(8), note: 'Analysis verified.' },
    { approval_id: apprAcme.id, user_id: userId, step_order: 1, role: 'approver', status: 'approved', decided_by: userId, decided_at: daysAgo(7), note: 'Counter approved.' },
  ])
  await db.insert(comments).values([
    { letter_id: letterAcme.id, user_id: userId, author: 'Procurement', body: 'Acme has tried this before; hold firm on the cap.' },
    { letter_id: letterAcme.id, user_id: userId, author: 'Finance', body: 'Capped impact is acceptable in this quarter.' },
  ])
  await db.insert(documents).values({
    workspace_id: workspaceId,
    user_id: userId,
    letter_id: letterAcme.id,
    contract_id: conAcme.id,
    name: 'Acme increase notice (original)',
    doc_type: 'attachment',
    content: 'Effective next quarter, list pricing on all corrugated SKUs will rise 9%...',
    url: '',
  })

  // Letter 2: SwiftFreight — index over-ask (diesel) + insufficient notice.
  const fuelVal = indexPct(idxFuel, basePeriod, currentPeriod)
  const [letterSwift] = await db
    .insert(increase_letters)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supSwift.id,
      contract_id: conSwift.id,
      title: 'SwiftFreight Fuel Surcharge Update',
      proposed_pct: 14,
      effective_date: daysFromNow(10),
      received_date: daysAgo(5),
      justification: 'Diesel costs have risen sharply; surcharge adjustment required.',
      raw_text: 'Due to fuel market conditions we are increasing the fuel surcharge by 14%, effective in ten days.',
      sender_contact: 'marco@swiftfreight.example',
      status: 'under_review',
      annual_impact_cents: 0,
    })
    .returning()
  await db.insert(letter_line_items).values({
    letter_id: letterSwift.id,
    user_id: userId,
    sku: 'LTL-ZONE-2',
    description: 'LTL shipment, zone 2',
    current_price_cents: 4200,
    proposed_price_cents: 4788,
    proposed_pct: 14,
    annual_volume: 22_000,
  })
  const swiftEntitled = fuelVal.pct
  const swiftOverAsk = Math.round((14 - swiftEntitled) * 10) / 10
  await db.insert(index_validations).values({
    letter_id: letterSwift.id,
    user_id: userId,
    index_id: idxFuel.id,
    claimed_pct: 14,
    base_period: fuelVal.basePeriod,
    current_period: fuelVal.currentPeriod,
    base_value: fuelVal.base,
    current_value: fuelVal.cur,
    actual_pct: fuelVal.pct,
    entitled_pct: swiftEntitled,
    over_ask_pct: swiftOverAsk,
    basket: [{ index_id: idxFuel.id, weight: 1, pct: fuelVal.pct }],
    detail: `Diesel index moved ${fuelVal.pct}% over the window; request of 14% is ${swiftOverAsk}% over the indexed entitlement.`,
  })
  await db.insert(clause_checks).values([
    {
      letter_id: letterSwift.id,
      clause_id: clSwiftIndex.id,
      user_id: userId,
      clause_type: 'indexation',
      verdict: swiftOverAsk > 0 ? 'breach' : 'compliant',
      severity: swiftOverAsk > 3 ? 'high' : 'medium',
      detail: `Indexation supports ${swiftEntitled}%; requested 14% is over-ask by ${swiftOverAsk}%.`,
      citation_text: clSwiftIndex.citation_text ?? '',
      expected_value: swiftEntitled,
      actual_value: 14,
    },
    {
      letter_id: letterSwift.id,
      clause_id: clSwiftNotice.id,
      user_id: userId,
      clause_type: 'notice_window',
      verdict: 'breach',
      severity: 'medium',
      detail: 'Notice given is ~10 days; agreement requires 60 days.',
      citation_text: clSwiftNotice.citation_text ?? '',
      expected_value: 60,
      actual_value: 10,
    },
  ])
  const swiftAnnualBase = 4200 * 22_000
  await db.insert(counter_scenarios).values([
    {
      letter_id: letterSwift.id,
      user_id: userId,
      name: 'Accept as proposed (14%)',
      scenario_type: 'accept_as_is',
      applied_pct: 14,
      annual_impact_cents: Math.round(swiftAnnualBase * 0.14),
      is_recommended: false,
      detail: 'Full surcharge pass-through.',
    },
    {
      letter_id: letterSwift.id,
      user_id: userId,
      name: `Index-entitled (${swiftEntitled}%)`,
      scenario_type: 'accept_indexed',
      applied_pct: swiftEntitled,
      annual_impact_cents: Math.round(swiftAnnualBase * (swiftEntitled / 100)),
      is_recommended: true,
      detail: 'Settle at the diesel-index-supported figure and require proper notice.',
    },
    {
      letter_id: letterSwift.id,
      user_id: userId,
      name: 'Reject on notice grounds',
      scenario_type: 'reject',
      applied_pct: 0,
      annual_impact_cents: 0,
      is_recommended: false,
      detail: 'Notice window not satisfied; defer effective date.',
    },
  ])
  await db
    .update(increase_letters)
    .set({
      aggregate_verdict: 'breach',
      defensibility_score: 28,
      annual_impact_cents: Math.round(swiftAnnualBase * (swiftEntitled / 100)),
      updated_at: new Date(),
    })
    .where(eq(increase_letters.id, letterSwift.id))
  await db.insert(comments).values({
    letter_id: letterSwift.id,
    user_id: userId,
    author: 'Logistics',
    body: 'Diesel index only supports a fraction of this; also notice is short.',
  })

  // Letter 3: Nimbus — fixed-price period breach (renewal uplift before term end).
  const [letterNimbus] = await db
    .insert(increase_letters)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supNimbus.id,
      contract_id: conNimbus.id,
      title: 'Nimbus Mid-Term Seat Uplift',
      proposed_pct: 7,
      effective_date: daysFromNow(45),
      received_date: daysAgo(3),
      justification: 'Platform investment and added capabilities.',
      raw_text: 'We are adjusting seat pricing by 7% effective in 45 days.',
      sender_contact: 'priya@nimbustools.example',
      status: 'logged',
      annual_impact_cents: 0,
    })
    .returning()
  await db.insert(letter_line_items).values({
    letter_id: letterNimbus.id,
    user_id: userId,
    sku: 'SEAT-PRO',
    description: 'Pro seat, annual',
    current_price_cents: 60_00,
    proposed_price_cents: 64_20,
    proposed_pct: 7,
    annual_volume: 200,
  })
  await db.insert(clause_checks).values({
    letter_id: letterNimbus.id,
    user_id: userId,
    clause_type: 'fixed_price_period',
    verdict: 'breach',
    severity: 'high',
    detail: 'Increase effective date falls within the fixed-price initial term.',
    citation_text: 'Section 3.1: Subscription fees are fixed through the initial term end date.',
    expected_value: 0,
    actual_value: 7,
  })
  const nimbusAnnualBase = 60_00 * 200
  await db.insert(counter_scenarios).values([
    {
      letter_id: letterNimbus.id,
      user_id: userId,
      name: 'Reject — fixed price in effect',
      scenario_type: 'reject',
      applied_pct: 0,
      annual_impact_cents: 0,
      is_recommended: true,
      detail: 'No increase permitted before the initial term end date.',
    },
    {
      letter_id: letterNimbus.id,
      user_id: userId,
      name: 'Accept at renewal (7%)',
      scenario_type: 'accept_as_is',
      applied_pct: 7,
      annual_impact_cents: Math.round(nimbusAnnualBase * 0.07),
      is_recommended: false,
      detail: 'Defer the uplift to the renewal date.',
    },
  ])
  await db
    .update(increase_letters)
    .set({ aggregate_verdict: 'breach', defensibility_score: 18, annual_impact_cents: 0, updated_at: new Date() })
    .where(eq(increase_letters.id, letterNimbus.id))

  // Letter 4: Polymer — compliant index-linked basket increase.
  const resinVal = indexPct(idxResin, basePeriod, currentPeriod)
  const polymerEntitled = Math.round((resinVal.pct * 0.7 + fuelVal.pct * 0.3) * 10) / 10
  const polymerProposed = Math.max(0, Math.round((polymerEntitled - 0.2) * 10) / 10)
  const [letterPolymer] = await db
    .insert(increase_letters)
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      supplier_id: supPolymer.id,
      contract_id: conPolymer.id,
      title: 'Polymer Direct Indexed Adjustment',
      proposed_pct: polymerProposed,
      effective_date: daysFromNow(30),
      received_date: daysAgo(8),
      justification: 'Quarterly index-based adjustment per Schedule 2.',
      raw_text: `Per the contractual basket, prices adjust by ${polymerProposed}% this quarter.`,
      sender_contact: 'leah@polymerdirect.example',
      status: 'accepted',
      annual_impact_cents: 0,
    })
    .returning()
  await db.insert(letter_line_items).values({
    letter_id: letterPolymer.id,
    user_id: userId,
    sku: 'PE-FILM-25',
    description: 'PE film, 25 micron',
    current_price_cents: 95,
    proposed_price_cents: Math.round(95 * (1 + polymerProposed / 100)),
    proposed_pct: polymerProposed,
    annual_volume: 3_000_000,
  })
  await db.insert(index_validations).values({
    letter_id: letterPolymer.id,
    user_id: userId,
    index_id: idxResin.id,
    claimed_pct: polymerProposed,
    base_period: basePeriod,
    current_period: currentPeriod,
    base_value: resinVal.base,
    current_value: resinVal.cur,
    actual_pct: resinVal.pct,
    entitled_pct: polymerEntitled,
    over_ask_pct: Math.round((polymerProposed - polymerEntitled) * 10) / 10,
    basket: [
      { index_id: idxResin.id, weight: 0.7, pct: resinVal.pct },
      { index_id: idxFuel.id, weight: 0.3, pct: fuelVal.pct },
    ],
    detail: `Weighted basket entitlement is ${polymerEntitled}%; request of ${polymerProposed}% is within entitlement.`,
  })
  await db.insert(clause_checks).values({
    letter_id: letterPolymer.id,
    clause_id: clPolymerBasket.id,
    user_id: userId,
    clause_type: 'indexation',
    verdict: 'compliant',
    severity: 'low',
    detail: `Request of ${polymerProposed}% is at or below the basket entitlement of ${polymerEntitled}%.`,
    citation_text: clPolymerBasket.citation_text ?? '',
    expected_value: polymerEntitled,
    actual_value: polymerProposed,
  })
  const polymerAnnualBase = 95 * 3_000_000
  await db.insert(counter_scenarios).values({
    letter_id: letterPolymer.id,
    user_id: userId,
    name: `Accept indexed (${polymerProposed}%)`,
    scenario_type: 'accept_indexed',
    applied_pct: polymerProposed,
    annual_impact_cents: Math.round(polymerAnnualBase * (polymerProposed / 100)),
    is_recommended: true,
    detail: 'Increase is within the contractual basket; accept.',
  })
  await db
    .update(increase_letters)
    .set({
      aggregate_verdict: 'compliant',
      defensibility_score: 88,
      annual_impact_cents: Math.round(polymerAnnualBase * (polymerProposed / 100)),
      updated_at: new Date(),
    })
    .where(eq(increase_letters.id, letterPolymer.id))

  // --- Supplier scorecards ---------------------------------------------------
  await db.insert(supplier_scorecards).values([
    {
      supplier_id: supAcme.id,
      user_id: userId,
      total_letters: 1,
      contests_won: 1,
      avg_over_ask_pct: 4,
      behavior_score: 45,
      total_avoided_cents: Math.round(acmeAnnualBase * 0.04),
      updated_at: new Date(),
    },
    {
      supplier_id: supSwift.id,
      user_id: userId,
      total_letters: 1,
      contests_won: 0,
      avg_over_ask_pct: swiftOverAsk,
      behavior_score: 38,
      total_avoided_cents: 0,
      updated_at: new Date(),
    },
    {
      supplier_id: supNimbus.id,
      user_id: userId,
      total_letters: 1,
      contests_won: 0,
      avg_over_ask_pct: 7,
      behavior_score: 30,
      total_avoided_cents: 0,
      updated_at: new Date(),
    },
    {
      supplier_id: supPolymer.id,
      user_id: userId,
      total_letters: 1,
      contests_won: 0,
      avg_over_ask_pct: 0,
      behavior_score: 92,
      total_avoided_cents: 0,
      updated_at: new Date(),
    },
  ])

  // --- Deadlines -------------------------------------------------------------
  await db.insert(deadlines).values([
    { workspace_id: workspaceId, user_id: userId, letter_id: letterSwift.id, contract_id: conSwift.id, kind: 'response', title: 'Respond to SwiftFreight surcharge', due_date: daysFromNow(4), status: 'open' },
    { workspace_id: workspaceId, user_id: userId, letter_id: letterAcme.id, contract_id: conAcme.id, kind: 'response', title: 'Send Acme pushback packet', due_date: daysFromNow(2), status: 'open' },
    { workspace_id: workspaceId, user_id: userId, letter_id: letterNimbus.id, contract_id: conNimbus.id, kind: 'response', title: 'Reject Nimbus mid-term uplift', due_date: daysAgo(1), status: 'overdue' },
    { workspace_id: workspaceId, user_id: userId, contract_id: conNimbus.id, kind: 'notice', title: 'Nimbus renewal notice window opens', due_date: daysFromNow(120), status: 'open' },
  ])

  // --- Notifications ---------------------------------------------------------
  await db.insert(notifications).values([
    { workspace_id: workspaceId, user_id: userId, type: 'breach', title: 'Breach detected: Acme', body: '9% request exceeds 5% annual cap.', link: `/dashboard/letters/${letterAcme.id}`, read: false },
    { workspace_id: workspaceId, user_id: userId, type: 'breach', title: 'Over-ask: SwiftFreight', body: 'Fuel surcharge exceeds index entitlement.', link: `/dashboard/letters/${letterSwift.id}`, read: false },
    { workspace_id: workspaceId, user_id: userId, type: 'deadline', title: 'Deadline overdue: Nimbus', body: 'Mid-term uplift response is overdue.', link: `/dashboard/letters/${letterNimbus.id}`, read: false },
    { workspace_id: workspaceId, user_id: userId, type: 'packet_ready', title: 'Packet ready: Acme', body: 'Pushback packet finalized.', link: `/dashboard/packets/${packetAcme.id}`, read: true },
  ])

  // --- Audit + activity ------------------------------------------------------
  await db.insert(audit_events).values([
    { workspace_id: workspaceId, user_id: userId, entity_type: 'letter', entity_id: letterAcme.id, action: 'created', actor: userId, detail: { proposed_pct: 9 } },
    { workspace_id: workspaceId, user_id: userId, entity_type: 'letter', entity_id: letterAcme.id, action: 'clause_check_run', actor: userId, detail: { verdict: 'breach' } },
    { workspace_id: workspaceId, user_id: userId, entity_type: 'packet', entity_id: packetAcme.id, action: 'generated', actor: userId, detail: { tone: 'firm' } },
    { workspace_id: workspaceId, user_id: userId, entity_type: 'approval', entity_id: apprAcme.id, action: 'approved', actor: userId, detail: { counter_pct: 5 } },
  ])
  await db.insert(activity_log).values([
    { workspace_id: workspaceId, user_id: userId, action: 'seed', entity_type: 'workspace', entity_id: workspaceId, summary: 'Sample data seeded' },
    { workspace_id: workspaceId, user_id: userId, action: 'letter_logged', entity_type: 'letter', entity_id: letterSwift.id, summary: 'SwiftFreight surcharge logged' },
  ])

  return c.json({
    seeded: {
      workspace_id: workspaceId,
      categories: 4,
      suppliers: 4,
      contracts: 4,
      clauses: 7,
      indices: 4,
      index_data_points: seriesByIndex.reduce((n, s) => n + s.series.length, 0),
      letters: 4,
      packets: 1,
      templates: 5,
      playbooks: 2,
      deadlines: 4,
      notifications: 4,
    },
  })
})

// ---------------------------------------------------------------------------
// POST /reset — clear the current workspace's sample data.
// ---------------------------------------------------------------------------

router.post('/reset', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .limit(1)
  if (!ws) return c.json({ success: true })
  await clearWorkspaceData(ws.id, userId)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// clearWorkspaceData — delete all dependent rows for a workspace in FK-safe
// order. Scoped to the owning user as a defense-in-depth ownership check.
// ---------------------------------------------------------------------------

async function clearWorkspaceData(workspaceId: string, userId: string) {
  // Resolve the id sets we need to cascade through, scoped to the workspace.
  const letterRows = await db
    .select({ id: increase_letters.id })
    .from(increase_letters)
    .where(and(eq(increase_letters.workspace_id, workspaceId), eq(increase_letters.user_id, userId)))
  const letterIds = letterRows.map((r) => r.id)

  const contractRows = await db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.workspace_id, workspaceId), eq(contracts.user_id, userId)))
  const contractIds = contractRows.map((r) => r.id)

  const supplierRows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.workspace_id, workspaceId), eq(suppliers.user_id, userId)))
  const supplierIds = supplierRows.map((r) => r.id)

  const packetRows = await db
    .select({ id: pushback_packets.id })
    .from(pushback_packets)
    .where(eq(pushback_packets.workspace_id, workspaceId))
  const packetIds = packetRows.map((r) => r.id)

  const approvalRows = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(eq(approvals.workspace_id, workspaceId))
  const approvalIds = approvalRows.map((r) => r.id)

  const indexRows = await db
    .select({ id: indices.id })
    .from(indices)
    .where(eq(indices.workspace_id, workspaceId))
  const indexIds = indexRows.map((r) => r.id)

  // Leaf rows first ----------------------------------------------------------
  if (packetIds.length) await db.delete(packet_sections).where(inArray(packet_sections.packet_id, packetIds))
  if (approvalIds.length) await db.delete(approval_steps).where(inArray(approval_steps.approval_id, approvalIds))
  if (letterIds.length) {
    await db.delete(letter_line_items).where(inArray(letter_line_items.letter_id, letterIds))
    await db.delete(clause_checks).where(inArray(clause_checks.letter_id, letterIds))
    await db.delete(index_validations).where(inArray(index_validations.letter_id, letterIds))
    await db.delete(counter_scenarios).where(inArray(counter_scenarios.letter_id, letterIds))
    await db.delete(comments).where(inArray(comments.letter_id, letterIds))
  }
  if (contractIds.length) {
    await db.delete(cumulative_creep_records).where(inArray(cumulative_creep_records.contract_id, contractIds))
    await db.delete(contract_clauses).where(inArray(contract_clauses.contract_id, contractIds))
  }
  if (supplierIds.length) await db.delete(supplier_scorecards).where(inArray(supplier_scorecards.supplier_id, supplierIds))
  if (indexIds.length) await db.delete(index_data_points).where(inArray(index_data_points.index_id, indexIds))

  // Workspace-scoped tables ---------------------------------------------------
  await db.delete(pushback_packets).where(eq(pushback_packets.workspace_id, workspaceId))
  await db.delete(approvals).where(eq(approvals.workspace_id, workspaceId))
  await db.delete(documents).where(eq(documents.workspace_id, workspaceId))
  await db.delete(deadlines).where(eq(deadlines.workspace_id, workspaceId))
  await db.delete(notifications).where(eq(notifications.workspace_id, workspaceId))
  await db.delete(audit_events).where(eq(audit_events.workspace_id, workspaceId))
  await db.delete(activity_log).where(eq(activity_log.workspace_id, workspaceId))
  await db.delete(spend_baselines).where(eq(spend_baselines.workspace_id, workspaceId))
  await db.delete(rebuttal_templates).where(eq(rebuttal_templates.workspace_id, workspaceId))
  await db.delete(playbooks).where(eq(playbooks.workspace_id, workspaceId))

  // Now the parent entities ---------------------------------------------------
  await db.delete(increase_letters).where(eq(increase_letters.workspace_id, workspaceId))
  await db.delete(contracts).where(eq(contracts.workspace_id, workspaceId))
  await db.delete(indices).where(eq(indices.workspace_id, workspaceId))
  await db.delete(suppliers).where(eq(suppliers.workspace_id, workspaceId))
  await db.delete(categories).where(eq(categories.workspace_id, workspaceId))
}

export default router
