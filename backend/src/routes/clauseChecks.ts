import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  clause_checks,
  contract_clauses,
  increase_letters,
  index_data_points,
} from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

type Verdict = 'compliant' | 'partial' | 'breach'
type Severity = 'low' | 'medium' | 'high'

interface CheckResult {
  clause_id: string | null
  clause_type: string
  verdict: Verdict
  severity: Severity
  detail: string
  citation_text: string
  expected_value: number | null
  actual_value: number | null
}

const runSchema = z.object({
  letter_id: z.string().min(1),
})

// Percent change between two index values.
function pctChange(base: number, current: number): number | null {
  if (!base || base === 0) return null
  return ((current - base) / base) * 100
}

// Resolve the latest and earliest values for an index to estimate index movement.
async function indexMovementPct(indexId: string): Promise<number | null> {
  const points = await db
    .select()
    .from(index_data_points)
    .where(eq(index_data_points.index_id, indexId))
    .orderBy(asc(index_data_points.period))
  if (points.length < 2) return null
  const base = points[0].value
  const current = points[points.length - 1].value
  return pctChange(base, current)
}

// Evaluate one clause against the letter's proposed_pct.
async function evaluateClause(
  clause: typeof contract_clauses.$inferSelect,
  proposedPct: number | null,
): Promise<CheckResult> {
  const proposed = proposedPct ?? 0
  const base: Omit<CheckResult, 'verdict' | 'severity' | 'detail' | 'expected_value' | 'actual_value'> = {
    clause_id: clause.id,
    clause_type: clause.clause_type,
    citation_text: clause.citation_text ?? '',
  }

  switch (clause.clause_type) {
    case 'annual_cap': {
      const cap = clause.cap_pct ?? null
      if (cap === null) {
        return {
          ...base,
          verdict: 'partial',
          severity: 'low',
          detail: 'Annual cap clause has no cap percentage configured; cannot fully verify.',
          expected_value: null,
          actual_value: proposed,
        }
      }
      if (proposed <= cap) {
        return {
          ...base,
          verdict: 'compliant',
          severity: 'low',
          detail: `Proposed increase ${proposed.toFixed(2)}% is within the ${cap.toFixed(2)}% annual cap.`,
          expected_value: cap,
          actual_value: proposed,
        }
      }
      const over = proposed - cap
      return {
        ...base,
        verdict: 'breach',
        severity: over > cap ? 'high' : 'medium',
        detail: `Proposed increase ${proposed.toFixed(2)}% exceeds the ${cap.toFixed(2)}% annual cap by ${over.toFixed(2)} points.`,
        expected_value: cap,
        actual_value: proposed,
      }
    }

    case 'cumulative_cap': {
      const cap = clause.cumulative_cap_pct ?? clause.cap_pct ?? null
      if (cap === null) {
        return {
          ...base,
          verdict: 'partial',
          severity: 'low',
          detail: 'Cumulative cap clause has no cap configured; verify against creep computation.',
          expected_value: null,
          actual_value: proposed,
        }
      }
      if (proposed <= cap) {
        return {
          ...base,
          verdict: 'compliant',
          severity: 'low',
          detail: `Single proposed increase ${proposed.toFixed(2)}% is within the cumulative cap of ${cap.toFixed(2)}%; confirm cumulative total via creep report.`,
          expected_value: cap,
          actual_value: proposed,
        }
      }
      return {
        ...base,
        verdict: 'breach',
        severity: 'high',
        detail: `Proposed increase ${proposed.toFixed(2)}% alone meets/exceeds the cumulative cap of ${cap.toFixed(2)}%.`,
        expected_value: cap,
        actual_value: proposed,
      }
    }

    case 'fixed_price_period': {
      const start = clause.fixed_start_date ? new Date(clause.fixed_start_date) : null
      const end = clause.fixed_end_date ? new Date(clause.fixed_end_date) : null
      const now = new Date()
      const inWindow = (!start || now >= start) && (!end || now <= end)
      if (inWindow && proposed > 0) {
        return {
          ...base,
          verdict: 'breach',
          severity: 'high',
          detail: `Any increase (${proposed.toFixed(2)}%) is prohibited during the fixed-price period${
            end ? ` ending ${end.toISOString().slice(0, 10)}` : ''
          }.`,
          expected_value: 0,
          actual_value: proposed,
        }
      }
      return {
        ...base,
        verdict: 'compliant',
        severity: 'low',
        detail: inWindow
          ? 'Within fixed-price period and no increase proposed.'
          : 'Outside the fixed-price period; clause does not restrict this increase.',
        expected_value: 0,
        actual_value: proposed,
      }
    }

    case 'indexation': {
      const entitled = clause.index_id ? await indexMovementPct(clause.index_id) : null
      if (entitled === null) {
        return {
          ...base,
          verdict: 'partial',
          severity: 'low',
          detail: 'Indexation clause references an index with insufficient data points to verify entitlement.',
          expected_value: null,
          actual_value: proposed,
        }
      }
      if (proposed <= entitled + 0.01) {
        return {
          ...base,
          verdict: 'compliant',
          severity: 'low',
          detail: `Proposed ${proposed.toFixed(2)}% is within index-entitled movement of ${entitled.toFixed(2)}%.`,
          expected_value: entitled,
          actual_value: proposed,
        }
      }
      const over = proposed - entitled
      return {
        ...base,
        verdict: 'breach',
        severity: over > entitled ? 'high' : 'medium',
        detail: `Proposed ${proposed.toFixed(2)}% exceeds index-entitled ${entitled.toFixed(2)}% by ${over.toFixed(2)} points (over-ask).`,
        expected_value: entitled,
        actual_value: proposed,
      }
    }

    case 'notice_window': {
      const noticeDays = clause.notice_days ?? null
      // Verified at the letter level (received vs effective); without those dates we report partial.
      return {
        ...base,
        verdict: 'partial',
        severity: noticeDays && noticeDays > 0 ? 'medium' : 'low',
        detail: noticeDays
          ? `Notice window requires ${noticeDays} days; confirm received-to-effective gap on the letter.`
          : 'Notice window clause present but no required days configured.',
        expected_value: noticeDays,
        actual_value: null,
      }
    }

    case 'mfn': {
      return {
        ...base,
        verdict: 'partial',
        severity: 'low',
        detail: 'Most-favored-nation clause present; confirm proposed pricing is not worse than peers.',
        expected_value: null,
        actual_value: proposed,
      }
    }

    case 'price_protection': {
      const cap = clause.cap_pct ?? null
      if (cap !== null && proposed > cap) {
        return {
          ...base,
          verdict: 'breach',
          severity: 'medium',
          detail: `Price-protection clause limits increases to ${cap.toFixed(2)}%; proposed ${proposed.toFixed(2)}% exceeds it.`,
          expected_value: cap,
          actual_value: proposed,
        }
      }
      return {
        ...base,
        verdict: 'compliant',
        severity: 'low',
        detail:
          cap !== null
            ? `Proposed ${proposed.toFixed(2)}% is within the price-protection limit of ${cap.toFixed(2)}%.`
            : 'Price-protection clause present; no numeric limit configured.',
        expected_value: cap,
        actual_value: proposed,
      }
    }

    default: {
      return {
        ...base,
        verdict: 'partial',
        severity: 'low',
        detail: `Clause type "${clause.clause_type}" recorded; manual review recommended.`,
        expected_value: clause.cap_pct ?? null,
        actual_value: proposed,
      }
    }
  }
}

// Roll up individual verdicts into an aggregate and a defensibility score (0-100).
function aggregate(results: CheckResult[]): { verdict: Verdict; score: number } {
  if (results.length === 0) {
    // No clauses to check against: the increase is undefended by contract terms.
    return { verdict: 'partial', score: 50 }
  }
  const hasBreach = results.some((r) => r.verdict === 'breach')
  const hasPartial = results.some((r) => r.verdict === 'partial')
  const verdict: Verdict = hasBreach ? 'breach' : hasPartial ? 'partial' : 'compliant'

  // Score: start at 100, subtract per finding weighted by verdict + severity.
  let penalty = 0
  for (const r of results) {
    const sevWeight = r.severity === 'high' ? 3 : r.severity === 'medium' ? 2 : 1
    if (r.verdict === 'breach') penalty += 12 * sevWeight
    else if (r.verdict === 'partial') penalty += 4 * sevWeight
  }
  const score = Math.max(0, Math.min(100, 100 - penalty))
  return { verdict, score }
}

// Public: list checks by ?letter_id
router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  if (!letterId) {
    const all = await db.select().from(clause_checks).orderBy(desc(clause_checks.created_at))
    return c.json(all)
  }
  const rows = await db
    .select()
    .from(clause_checks)
    .where(eq(clause_checks.letter_id, letterId))
    .orderBy(desc(clause_checks.created_at))
  return c.json(rows)
})

// Auth: run the clause-check engine for { letter_id }
router.post('/run', authMiddleware, zValidator('json', runSchema), async (c) => {
  const userId = getUserId(c)
  const { letter_id } = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Gather contract clauses (empty set if the letter has no contract).
  const clauses = letter.contract_id
    ? await db
        .select()
        .from(contract_clauses)
        .where(eq(contract_clauses.contract_id, letter.contract_id))
        .orderBy(asc(contract_clauses.created_at))
    : []

  const results: CheckResult[] = []
  for (const clause of clauses) {
    results.push(await evaluateClause(clause, letter.proposed_pct ?? null))
  }

  // Replace any previous checks for this letter, then persist the new run.
  await db.delete(clause_checks).where(eq(clause_checks.letter_id, letter_id))

  let persisted: (typeof clause_checks.$inferSelect)[] = []
  if (results.length) {
    persisted = await db
      .insert(clause_checks)
      .values(
        results.map((r) => ({
          letter_id,
          clause_id: r.clause_id,
          user_id: userId,
          clause_type: r.clause_type,
          verdict: r.verdict,
          severity: r.severity,
          detail: r.detail,
          citation_text: r.citation_text,
          expected_value: r.expected_value,
          actual_value: r.actual_value,
        })),
      )
      .returning()
  }

  const { verdict, score } = aggregate(results)

  const [updated] = await db
    .update(increase_letters)
    .set({
      aggregate_verdict: verdict,
      defensibility_score: score,
      updated_at: new Date(),
    })
    .where(eq(increase_letters.id, letter_id))
    .returning()

  return c.json({
    checks: persisted,
    aggregate_verdict: updated.aggregate_verdict,
    defensibility_score: updated.defensibility_score,
  })
})

export default router
