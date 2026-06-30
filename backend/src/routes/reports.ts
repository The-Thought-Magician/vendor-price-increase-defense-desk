import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  increase_letters,
  suppliers,
  categories,
  counter_scenarios,
  index_validations,
} from '../db/schema.js'
import { eq } from 'drizzle-orm'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an ISO-ish date to a "YYYY-Qn" quarter label. */
function quarterLabel(d: Date): string {
  const y = d.getUTCFullYear()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${y}-Q${q}`
}

/**
 * Pick the "accepted" / settled percent for a letter. Prefer a recommended
 * counter-scenario's applied_pct (what we actually agreed to); fall back to
 * the proposed_pct only when the letter was accepted as-is.
 */
function settledPct(
  letter: { status: string; proposed_pct: number | null },
  recommended: { applied_pct: number | null } | undefined,
): number {
  if (recommended && recommended.applied_pct != null) return recommended.applied_pct
  // No modeled scenario: an accepted letter settles at the proposed ask;
  // a contested/withdrawn/resolved one defaults to 0 until modeled.
  if (letter.status === 'accepted') return letter.proposed_pct ?? 0
  return 0
}

// ---------------------------------------------------------------------------
// GET /savings — proposed vs accepted vs avoided rollup
// ---------------------------------------------------------------------------
router.get('/savings', async (c) => {
  const letters = await db.select().from(increase_letters)
  const supplierRows = await db.select().from(suppliers)
  const categoryRows = await db.select().from(categories)
  const scenarios = await db.select().from(counter_scenarios)

  // Recommended scenario per letter (fallback to first recommended found).
  const recommendedByLetter = new Map<string, { applied_pct: number | null; annual_impact_cents: number }>()
  for (const s of scenarios) {
    if (s.is_recommended && !recommendedByLetter.has(s.letter_id)) {
      recommendedByLetter.set(s.letter_id, {
        applied_pct: s.applied_pct,
        annual_impact_cents: s.annual_impact_cents,
      })
    }
  }

  const supplierById = new Map(supplierRows.map((s) => [s.id, s]))
  const categoryById = new Map(categoryRows.map((cat) => [cat.id, cat]))

  type Bucket = {
    proposed_impact_cents: number
    accepted_impact_cents: number
    avoided_cents: number
    letters: number
  }
  const emptyBucket = (): Bucket => ({
    proposed_impact_cents: 0,
    accepted_impact_cents: 0,
    avoided_cents: 0,
    letters: 0,
  })

  const totals = emptyBucket()
  const bySupplier = new Map<string, Bucket & { supplier_id: string; supplier_name: string }>()
  const byCategory = new Map<string, Bucket & { category_id: string; category_name: string }>()

  for (const letter of letters) {
    const proposedImpact = letter.annual_impact_cents ?? 0
    const proposedPct = letter.proposed_pct ?? 0
    const rec = recommendedByLetter.get(letter.id)
    const acceptedPct = settledPct(letter, rec)

    // Accepted impact scales the proposed annual impact by accepted/proposed pct.
    let acceptedImpact: number
    if (rec && rec.annual_impact_cents) {
      acceptedImpact = rec.annual_impact_cents
    } else if (proposedPct > 0) {
      acceptedImpact = Math.round(proposedImpact * (acceptedPct / proposedPct))
    } else {
      acceptedImpact = proposedImpact
    }
    const avoided = Math.max(0, proposedImpact - acceptedImpact)

    totals.proposed_impact_cents += proposedImpact
    totals.accepted_impact_cents += acceptedImpact
    totals.avoided_cents += avoided
    totals.letters += 1

    const sup = supplierById.get(letter.supplier_id)
    const supKey = letter.supplier_id
    if (!bySupplier.has(supKey)) {
      bySupplier.set(supKey, {
        ...emptyBucket(),
        supplier_id: supKey,
        supplier_name: sup?.name ?? 'Unknown',
      })
    }
    const sb = bySupplier.get(supKey)!
    sb.proposed_impact_cents += proposedImpact
    sb.accepted_impact_cents += acceptedImpact
    sb.avoided_cents += avoided
    sb.letters += 1

    const catId = sup?.category_id ?? 'uncategorized'
    if (!byCategory.has(catId)) {
      byCategory.set(catId, {
        ...emptyBucket(),
        category_id: catId,
        category_name: catId === 'uncategorized' ? 'Uncategorized' : categoryById.get(catId)?.name ?? 'Unknown',
      })
    }
    const cb = byCategory.get(catId)!
    cb.proposed_impact_cents += proposedImpact
    cb.accepted_impact_cents += acceptedImpact
    cb.avoided_cents += avoided
    cb.letters += 1
  }

  return c.json({
    totals,
    by_supplier: [...bySupplier.values()].sort((a, b) => b.avoided_cents - a.avoided_cents),
    by_category: [...byCategory.values()].sort((a, b) => b.avoided_cents - a.avoided_cents),
  })
})

// ---------------------------------------------------------------------------
// GET /inflation-wave — quarter-over-quarter inflation-wave report
// ---------------------------------------------------------------------------
router.get('/inflation-wave', async (c) => {
  const letters = await db.select().from(increase_letters)

  type Period = {
    period: string
    letter_count: number
    total_proposed_pct: number
    avg_proposed_pct: number
    total_proposed_impact_cents: number
    breach_count: number
  }
  const periods = new Map<string, Period>()

  for (const letter of letters) {
    const dateSrc = letter.received_date ?? letter.effective_date ?? letter.created_at
    if (!dateSrc) continue
    const label = quarterLabel(new Date(dateSrc as unknown as string | Date))
    if (!periods.has(label)) {
      periods.set(label, {
        period: label,
        letter_count: 0,
        total_proposed_pct: 0,
        avg_proposed_pct: 0,
        total_proposed_impact_cents: 0,
        breach_count: 0,
      })
    }
    const p = periods.get(label)!
    p.letter_count += 1
    p.total_proposed_pct += letter.proposed_pct ?? 0
    p.total_proposed_impact_cents += letter.annual_impact_cents ?? 0
    if (letter.aggregate_verdict === 'breach') p.breach_count += 1
  }

  const sorted = [...periods.values()].sort((a, b) => a.period.localeCompare(b.period))
  for (const p of sorted) {
    p.avg_proposed_pct = p.letter_count > 0 ? p.total_proposed_pct / p.letter_count : 0
  }

  // Quarter-over-quarter deltas in average proposed pct.
  const withDelta = sorted.map((p, i) => {
    const prev = i > 0 ? sorted[i - 1] : null
    const qoq_avg_pct_delta = prev ? p.avg_proposed_pct - prev.avg_proposed_pct : 0
    const qoq_letter_count_delta = prev ? p.letter_count - prev.letter_count : 0
    return { ...p, qoq_avg_pct_delta, qoq_letter_count_delta }
  })

  return c.json({ periods: withDelta })
})

// ---------------------------------------------------------------------------
// GET /supplier-behavior — over-ask / behavior report per supplier
// ---------------------------------------------------------------------------
router.get('/supplier-behavior', async (c) => {
  const letters = await db.select().from(increase_letters)
  const supplierRows = await db.select().from(suppliers)
  const validations = await db.select().from(index_validations)

  // Average over-ask pct per letter from index validations.
  const overAskByLetter = new Map<string, number[]>()
  for (const v of validations) {
    if (v.over_ask_pct == null) continue
    const arr = overAskByLetter.get(v.letter_id) ?? []
    arr.push(v.over_ask_pct)
    overAskByLetter.set(v.letter_id, arr)
  }

  type Row = {
    supplier_id: string
    supplier_name: string
    total_letters: number
    breach_letters: number
    contested_letters: number
    avg_proposed_pct: number
    avg_over_ask_pct: number
    total_proposed_impact_cents: number
    behavior_score: number
  }
  const rows = new Map<string, Row & { _sumProposed: number; _sumOverAsk: number; _overAskCount: number }>()
  const supplierById = new Map(supplierRows.map((s) => [s.id, s]))

  for (const letter of letters) {
    const key = letter.supplier_id
    if (!rows.has(key)) {
      rows.set(key, {
        supplier_id: key,
        supplier_name: supplierById.get(key)?.name ?? 'Unknown',
        total_letters: 0,
        breach_letters: 0,
        contested_letters: 0,
        avg_proposed_pct: 0,
        avg_over_ask_pct: 0,
        total_proposed_impact_cents: 0,
        behavior_score: 0,
        _sumProposed: 0,
        _sumOverAsk: 0,
        _overAskCount: 0,
      })
    }
    const r = rows.get(key)!
    r.total_letters += 1
    r._sumProposed += letter.proposed_pct ?? 0
    r.total_proposed_impact_cents += letter.annual_impact_cents ?? 0
    if (letter.aggregate_verdict === 'breach') r.breach_letters += 1
    if (letter.status === 'contested') r.contested_letters += 1
    const overAsks = overAskByLetter.get(letter.id)
    if (overAsks && overAsks.length) {
      const avg = overAsks.reduce((a, b) => a + b, 0) / overAsks.length
      r._sumOverAsk += avg
      r._overAskCount += 1
    }
  }

  const out: Row[] = []
  for (const r of rows.values()) {
    r.avg_proposed_pct = r.total_letters > 0 ? r._sumProposed / r.total_letters : 0
    r.avg_over_ask_pct = r._overAskCount > 0 ? r._sumOverAsk / r._overAskCount : 0
    // Behavior score: higher is worse. Driven by over-ask, breach rate, contest rate.
    const breachRate = r.total_letters > 0 ? r.breach_letters / r.total_letters : 0
    const contestRate = r.total_letters > 0 ? r.contested_letters / r.total_letters : 0
    r.behavior_score = Math.round(
      (r.avg_over_ask_pct * 5 + breachRate * 40 + contestRate * 20) * 10,
    ) / 10
    const { _sumProposed, _sumOverAsk, _overAskCount, ...clean } = r
    void _sumProposed
    void _sumOverAsk
    void _overAskCount
    out.push(clean)
  }

  out.sort((a, b) => b.behavior_score - a.behavior_score)
  return c.json(out)
})

export default router
