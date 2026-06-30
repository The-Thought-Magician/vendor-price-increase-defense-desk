import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  index_validations,
  increase_letters,
  indices,
  index_data_points,
  contract_clauses,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a single index data-point value for an index at a given period. */
async function pointValue(indexId: string, period: string): Promise<number | null> {
  if (!indexId || !period) return null
  const [dp] = await db
    .select()
    .from(index_data_points)
    .where(and(eq(index_data_points.index_id, indexId), eq(index_data_points.period, period)))
  return dp ? dp.value : null
}

/** Percentage movement between two values; null if base is missing/zero. */
function movementPct(base: number | null, current: number | null): number | null {
  if (base === null || current === null) return null
  if (base === 0) return null
  return ((current - base) / base) * 100
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------------------------------------------------------------------------
// GET / — list validations by ?letter_id (public read)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  if (!letterId) {
    const all = await db
      .select()
      .from(index_validations)
      .orderBy(desc(index_validations.created_at))
    return c.json(all)
  }
  const rows = await db
    .select()
    .from(index_validations)
    .where(eq(index_validations.letter_id, letterId))
    .orderBy(desc(index_validations.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// POST /run — compare claimed vs actual published index movement.
// Supports single index or a weighted basket pulled from the letter's
// contract clause (indexation clause) when index_id is omitted.
// ---------------------------------------------------------------------------

const runSchema = z.object({
  letter_id: z.string().min(1),
  index_id: z.string().min(1).optional(),
  base_period: z.string().min(1),
  current_period: z.string().min(1),
  claimed_pct: z.number().optional(),
})

router.post('/run', authMiddleware, zValidator('json', runSchema), async (c) => {
  const userId = getUserId(c)
  const { letter_id, index_id, base_period, current_period, claimed_pct } = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // The claimed increase: explicit override, else the letter's proposed_pct.
  const claimed = claimed_pct ?? letter.proposed_pct ?? 0

  // Determine the index/basket to validate against.
  // Priority: explicit index_id > indexation clause basket > clause single index.
  let basketDef: Array<{ index_id: string; weight: number }> = []

  if (index_id) {
    basketDef = [{ index_id, weight: 1 }]
  } else if (letter.contract_id) {
    const clauses = await db
      .select()
      .from(contract_clauses)
      .where(
        and(
          eq(contract_clauses.contract_id, letter.contract_id),
          eq(contract_clauses.clause_type, 'indexation'),
        ),
      )
    const [clause] = clauses
    if (clause) {
      const rawBasket = (clause.index_basket ?? []) as Array<{ index_id: string; weight: number }>
      if (rawBasket.length > 0) {
        basketDef = rawBasket.filter((b) => b && b.index_id)
      } else if (clause.index_id) {
        basketDef = [{ index_id: clause.index_id, weight: 1 }]
      }
    }
  }

  if (basketDef.length === 0) {
    return c.json(
      { error: 'No index or indexation clause basket available to validate against' },
      400,
    )
  }

  // Normalize weights so they sum to 1.
  const totalWeight = basketDef.reduce((s, b) => s + (b.weight || 0), 0)
  const normalized = basketDef.map((b) => ({
    index_id: b.index_id,
    weight: totalWeight > 0 ? (b.weight || 0) / totalWeight : 1 / basketDef.length,
  }))

  // Compute movement for each basket component.
  const components: Array<{ index_id: string; weight: number; pct: number }> = []
  let weightedActual = 0
  let resolvedComponents = 0
  let firstBaseValue: number | null = null
  let firstCurrentValue: number | null = null

  for (const comp of normalized) {
    const base = await pointValue(comp.index_id, base_period)
    const current = await pointValue(comp.index_id, current_period)
    const pct = movementPct(base, current)
    const pctVal = pct === null ? 0 : pct
    if (pct !== null) {
      weightedActual += pctVal * comp.weight
      resolvedComponents += 1
    }
    if (firstBaseValue === null && base !== null) firstBaseValue = base
    if (firstCurrentValue === null && current !== null) firstCurrentValue = current
    components.push({ index_id: comp.index_id, weight: round2(comp.weight), pct: round2(pctVal) })
  }

  if (resolvedComponents === 0) {
    return c.json(
      { error: 'No index data points found for the requested base/current periods' },
      400,
    )
  }

  const actualPct = round2(weightedActual)
  // Entitled increase is what the index movement justifies.
  const entitledPct = actualPct
  const overAskPct = round2(claimed - entitledPct)

  const isBasket = normalized.length > 1
  const primaryIndexId = normalized[0].index_id

  let detail: string
  if (overAskPct > 0) {
    detail = `Claimed ${round2(claimed)}% exceeds index-entitled ${entitledPct}% by ${overAskPct} points (${
      isBasket ? `${normalized.length}-index basket` : 'single index'
    }, ${base_period}→${current_period}).`
  } else if (overAskPct < 0) {
    detail = `Claimed ${round2(claimed)}% is below the index-entitled ${entitledPct}% (under-ask by ${Math.abs(
      overAskPct,
    )} points).`
  } else {
    detail = `Claimed ${round2(claimed)}% matches the index-entitled ${entitledPct}% exactly.`
  }

  const [validation] = await db
    .insert(index_validations)
    .values({
      letter_id,
      user_id: userId,
      index_id: primaryIndexId,
      claimed_pct: round2(claimed),
      base_period,
      current_period,
      base_value: firstBaseValue,
      current_value: firstCurrentValue,
      actual_pct: actualPct,
      entitled_pct: entitledPct,
      over_ask_pct: overAskPct,
      basket: components,
      detail,
    })
    .returning()

  return c.json({ validation }, 201)
})

export default router
