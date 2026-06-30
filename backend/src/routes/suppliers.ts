import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  suppliers,
  workspaces,
  increase_letters,
  supplier_scorecards,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  category_id: z.string().nullable().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().optional(),
  annual_spend_cents: z.number().int().min(0).optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category_id: z.string().nullable().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().optional(),
  annual_spend_cents: z.number().int().min(0).optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
})

// GET / — list suppliers (optional ?workspace_id). Public read.
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.workspace_id, workspaceId))
        .orderBy(desc(suppliers.created_at))
    : await db.select().from(suppliers).orderBy(desc(suppliers.created_at))
  return c.json(rows)
})

// GET /:id — supplier detail. Public read.
router.get('/:id', async (c) => {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ supplier: row })
})

// GET /:id/scorecard — computed scorecard, persisted (upsert). Public read.
router.get('/:id/scorecard', async (c) => {
  const supplierId = c.req.param('id')
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId))
  if (!supplier) return c.json({ error: 'Not found' }, 404)

  const letters = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.supplier_id, supplierId))

  const totalLetters = letters.length
  // A contest is "won" when the letter ended up contested/withdrawn/resolved
  // after we pushed back (i.e. not simply accepted).
  const contestsWon = letters.filter((l) =>
    ['contested', 'withdrawn', 'resolved'].includes(l.status),
  ).length

  // over-ask = how much the supplier asked beyond what they were entitled to.
  // We approximate per-letter over-ask as proposed_pct where the aggregate
  // verdict was a breach/partial; average across letters that have a proposed_pct.
  const overAskValues = letters
    .filter((l) => l.aggregate_verdict === 'breach' || l.aggregate_verdict === 'partial')
    .map((l) => (typeof l.proposed_pct === 'number' ? l.proposed_pct : 0))
  const avgOverAsk =
    overAskValues.length > 0
      ? overAskValues.reduce((a, b) => a + b, 0) / overAskValues.length
      : 0

  // Total avoided = sum of annual_impact_cents on letters we contested/withdrew/resolved.
  const totalAvoided = letters
    .filter((l) => ['contested', 'withdrawn', 'resolved'].includes(l.status))
    .reduce((sum, l) => sum + (l.annual_impact_cents ?? 0), 0)

  // Behavior score: 0-100. Lower over-ask and higher contest-win-rate => better.
  // Start at 100, penalise average over-ask, reward contest activity.
  const winRate = totalLetters > 0 ? contestsWon / totalLetters : 0
  let behaviorScore = 100 - Math.min(80, avgOverAsk * 4) + winRate * 10
  behaviorScore = Math.max(0, Math.min(100, behaviorScore))

  const computed = {
    supplier_id: supplierId,
    user_id: supplier.user_id,
    total_letters: totalLetters,
    contests_won: contestsWon,
    avg_over_ask_pct: avgOverAsk,
    behavior_score: behaviorScore,
    total_avoided_cents: totalAvoided,
    updated_at: new Date(),
  }

  const [scorecard] = await db
    .insert(supplier_scorecards)
    .values(computed)
    .onConflictDoUpdate({
      target: supplier_scorecards.supplier_id,
      set: {
        total_letters: computed.total_letters,
        contests_won: computed.contests_won,
        avg_over_ask_pct: computed.avg_over_ask_pct,
        behavior_score: computed.behavior_score,
        total_avoided_cents: computed.total_avoided_cents,
        updated_at: computed.updated_at,
      },
    })
    .returning()

  return c.json({ scorecard })
})

// GET /:id/letters — letters for supplier. Public read.
router.get('/:id/letters', async (c) => {
  const supplierId = c.req.param('id')
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId))
  if (!supplier) return c.json({ error: 'Not found' }, 404)
  const rows = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.supplier_id, supplierId))
    .orderBy(desc(increase_letters.created_at))
  return c.json(rows)
})

// POST / — create. Auth + workspace ownership check.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, body.workspace_id))
  if (!ws) return c.json({ error: 'Workspace not found' }, 404)
  if (ws.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(suppliers)
    .values({ ...body, user_id: userId })
    .returning()
  return c.json({ supplier: created }, 201)
})

// PUT /:id — update. Auth + ownership check.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(suppliers).set(body).where(eq(suppliers.id, id)).returning()
  return c.json({ supplier: updated })
})

// DELETE /:id — delete. Auth + ownership check.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(suppliers).where(eq(suppliers.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(suppliers).where(eq(suppliers.id, id))
  return c.json({ success: true })
})

export default router
