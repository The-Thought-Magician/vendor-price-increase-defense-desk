import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  cumulative_creep_records,
  contracts,
  contract_clauses,
  increase_letters,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** A sortable key for a letter: prefer effective_date, else received_date, else created_at. */
function letterDate(l: {
  effective_date: Date | null
  received_date: Date | null
  created_at: Date
}): Date {
  return l.effective_date ?? l.received_date ?? l.created_at
}

// ---------------------------------------------------------------------------
// GET / — creep records by ?contract_id (public read)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const contractId = c.req.query('contract_id')
  if (!contractId) {
    const all = await db
      .select()
      .from(cumulative_creep_records)
      .orderBy(desc(cumulative_creep_records.created_at))
    return c.json(all)
  }
  const rows = await db
    .select()
    .from(cumulative_creep_records)
    .where(eq(cumulative_creep_records.contract_id, contractId))
    .orderBy(desc(cumulative_creep_records.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /compute — compute cumulative compounded movement across a contract's
// letters vs the multi-year cumulative cap clause, persist a record.
// ---------------------------------------------------------------------------

const computeSchema = z.object({
  contract_id: z.string().min(1),
})

router.post('/compute', authMiddleware, zValidator('json', computeSchema), async (c) => {
  const userId = getUserId(c)
  const { contract_id } = c.req.valid('json')

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contract_id))
  if (!contract) return c.json({ error: 'Contract not found' }, 404)
  if (contract.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Resolve the cumulative cap from a cumulative_cap clause (cumulative_cap_pct
  // preferred, falling back to cap_pct on that clause).
  const clauses = await db
    .select()
    .from(contract_clauses)
    .where(
      and(
        eq(contract_clauses.contract_id, contract_id),
        eq(contract_clauses.clause_type, 'cumulative_cap'),
      ),
    )
  const [capClause] = clauses
  const capPct =
    capClause?.cumulative_cap_pct ?? capClause?.cap_pct ?? null

  // Gather all letters for this contract, oldest first.
  const letters = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.contract_id, contract_id))

  const sorted = [...letters].sort(
    (a, b) => letterDate(a).getTime() - letterDate(b).getTime(),
  )

  // Compound each accepted/proposed increase: factor *= (1 + pct/100).
  let factor = 1
  const timeline: Array<{ date: string; pct: number; cumulative: number }> = []
  let lastLetterId: string | null = null

  for (const l of sorted) {
    const pct = l.proposed_pct ?? 0
    factor *= 1 + pct / 100
    const cumulative = round2((factor - 1) * 100)
    timeline.push({
      date: letterDate(l).toISOString(),
      pct: round2(pct),
      cumulative,
    })
    lastLetterId = l.id
  }

  const cumulativePct = round2((factor - 1) * 100)
  const breached = capPct !== null ? cumulativePct > capPct : false

  const [record] = await db
    .insert(cumulative_creep_records)
    .values({
      contract_id,
      letter_id: lastLetterId,
      user_id: userId,
      cumulative_pct: cumulativePct,
      cap_pct: capPct,
      breached,
      timeline,
    })
    .returning()

  return c.json({ record }, 201)
})

export default router
