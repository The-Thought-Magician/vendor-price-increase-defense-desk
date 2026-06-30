import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  counter_scenarios,
  increase_letters,
  letter_line_items,
  contract_clauses,
  index_validations,
  suppliers,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const customScenarioSchema = z.object({
  letter_id: z.string().min(1),
  name: z.string().min(1),
  scenario_type: z.enum(['accept_as_is', 'accept_capped', 'accept_indexed', 'reject']),
  applied_pct: z.number().optional().nullable(),
  detail: z.string().optional().default(''),
})

const modelSchema = z.object({
  letter_id: z.string().min(1),
})

/**
 * Determine the annualized baseline spend (in cents) that an increase applies
 * to. Prefers explicit line-item annual revenue (current_price * volume); falls
 * back to the supplier's recorded annual_spend_cents.
 */
async function annualBaseCents(letterId: string, supplierId: string): Promise<number> {
  const items = await db
    .select()
    .from(letter_line_items)
    .where(eq(letter_line_items.letter_id, letterId))
  if (items.length > 0) {
    let total = 0
    for (const it of items) {
      total += (it.current_price_cents ?? 0) * (it.annual_volume ?? 0)
    }
    if (total > 0) return total
  }
  const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId))
  return sup?.annual_spend_cents ?? 0
}

/** Annual impact (cents) of applying `pct` percent increase to a base. */
function impactCents(baseCents: number, pct: number): number {
  return Math.round(baseCents * (pct / 100))
}

// Public: list scenarios for a letter (most recent first), filtered by ?letter_id
router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  if (!letterId) return c.json({ error: 'letter_id is required' }, 400)
  const rows = await db
    .select()
    .from(counter_scenarios)
    .where(eq(counter_scenarios.letter_id, letterId))
    .orderBy(desc(counter_scenarios.created_at))
  return c.json(rows)
})

// Auth: model the standard counter-offer scenario set for a letter.
// Generates accept_as_is / accept_capped / accept_indexed / reject, computes
// annual impact for each, marks the lowest-impact defensible option recommended,
// replaces any previously modeled set, and returns the persisted scenarios.
router.post('/model', authMiddleware, zValidator('json', modelSchema), async (c) => {
  const userId = getUserId(c)
  const { letter_id } = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const proposedPct = letter.proposed_pct ?? 0
  const baseCents = await annualBaseCents(letter_id, letter.supplier_id)

  // Cap percent: lowest annual_cap clause pct on the contract, if any.
  let capPct: number | null = null
  if (letter.contract_id) {
    const clauses = await db
      .select()
      .from(contract_clauses)
      .where(eq(contract_clauses.contract_id, letter.contract_id))
    for (const cl of clauses) {
      if (cl.clause_type === 'annual_cap' && cl.cap_pct != null) {
        capPct = capPct == null ? cl.cap_pct : Math.min(capPct, cl.cap_pct)
      }
    }
  }
  // If no cap clause, fall back to the supplier's recorded cap is not available;
  // use the smaller of proposed and a default conservative cap of 0 (no increase).
  const cappedPct = capPct != null ? Math.min(proposedPct, capPct) : 0

  // Indexed percent: latest index validation's entitled_pct for this letter.
  const [validation] = await db
    .select()
    .from(index_validations)
    .where(eq(index_validations.letter_id, letter_id))
    .orderBy(desc(index_validations.created_at))
  const indexedPct =
    validation?.entitled_pct != null ? Math.min(proposedPct, validation.entitled_pct) : 0

  type Built = {
    name: string
    scenario_type: 'accept_as_is' | 'accept_capped' | 'accept_indexed' | 'reject'
    applied_pct: number
    detail: string
  }

  const built: Built[] = [
    {
      name: 'Accept as proposed',
      scenario_type: 'accept_as_is',
      applied_pct: proposedPct,
      detail: `Accept the full proposed increase of ${proposedPct}%.`,
    },
    {
      name: 'Accept at contractual cap',
      scenario_type: 'accept_capped',
      applied_pct: cappedPct,
      detail:
        capPct != null
          ? `Hold to the contractual annual cap of ${capPct}% (proposed was ${proposedPct}%).`
          : `No cap clause found; counter to 0% pending clause review (proposed was ${proposedPct}%).`,
    },
    {
      name: 'Accept index-entitled increase',
      scenario_type: 'accept_indexed',
      applied_pct: indexedPct,
      detail:
        validation?.entitled_pct != null
          ? `Limit to the index-entitled increase of ${validation.entitled_pct}% (proposed was ${proposedPct}%).`
          : `No index validation run; counter to 0% pending index check (proposed was ${proposedPct}%).`,
    },
    {
      name: 'Reject increase',
      scenario_type: 'reject',
      applied_pct: 0,
      detail: 'Reject the increase entirely; hold current pricing.',
    },
  ]

  // Recommend the lowest-impact scenario that is still "defensible": prefer
  // capped/indexed when they materially reduce impact below as-is; otherwise the
  // lowest applied_pct option.
  let recommendedIdx = 0
  let lowest = Number.POSITIVE_INFINITY
  built.forEach((b, i) => {
    const imp = impactCents(baseCents, b.applied_pct)
    if (imp < lowest) {
      lowest = imp
      recommendedIdx = i
    }
  })

  // Replace any previously modeled scenarios for this letter.
  await db.delete(counter_scenarios).where(eq(counter_scenarios.letter_id, letter_id))

  const inserted = []
  for (let i = 0; i < built.length; i++) {
    const b = built[i]
    const [row] = await db
      .insert(counter_scenarios)
      .values({
        letter_id,
        user_id: userId,
        name: b.name,
        scenario_type: b.scenario_type,
        applied_pct: b.applied_pct,
        annual_impact_cents: impactCents(baseCents, b.applied_pct),
        is_recommended: i === recommendedIdx,
        detail: b.detail,
      })
      .returning()
    inserted.push(row)
  }

  return c.json(inserted, 201)
})

// Auth: create a single custom scenario
router.post('/', authMiddleware, zValidator('json', customScenarioSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, body.letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const appliedPct = body.applied_pct ?? 0
  const baseCents = await annualBaseCents(body.letter_id, letter.supplier_id)

  const [created] = await db
    .insert(counter_scenarios)
    .values({
      letter_id: body.letter_id,
      user_id: userId,
      name: body.name,
      scenario_type: body.scenario_type,
      applied_pct: appliedPct,
      annual_impact_cents: impactCents(baseCents, appliedPct),
      is_recommended: false,
      detail: body.detail ?? '',
    })
    .returning()
  return c.json({ scenario: created }, 201)
})

// Auth: delete a scenario (owner only)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(counter_scenarios).where(eq(counter_scenarios.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(counter_scenarios).where(eq(counter_scenarios.id, id))
  return c.json({ success: true })
})

export default router
