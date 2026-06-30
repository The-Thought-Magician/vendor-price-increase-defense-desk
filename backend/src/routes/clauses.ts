import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { contract_clauses, contracts } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CLAUSE_TYPES = [
  'annual_cap',
  'fixed_price_period',
  'indexation',
  'notice_window',
  'cumulative_cap',
  'mfn',
  'price_protection',
] as const

const basketSchema = z
  .array(z.object({ index_id: z.string().min(1), weight: z.number() }))
  .optional()

const clauseSchema = z.object({
  contract_id: z.string().min(1),
  clause_type: z.enum(CLAUSE_TYPES),
  title: z.string().min(1),
  citation_text: z.string().optional(),
  cap_pct: z.number().optional().nullable(),
  cumulative_cap_pct: z.number().optional().nullable(),
  notice_days: z.number().int().optional().nullable(),
  fixed_start_date: z.string().datetime().optional().nullable(),
  fixed_end_date: z.string().datetime().optional().nullable(),
  index_id: z.string().optional().nullable(),
  index_basket: basketSchema,
  config: z.record(z.string(), z.unknown()).optional(),
})

const clauseUpdateSchema = clauseSchema.partial().omit({ contract_id: true })

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(v)
}

// ---------------------------------------------------------------------------
// GET / — public — list clauses by ?contract_id
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const contractId = c.req.query('contract_id')
  const rows = contractId
    ? await db
        .select()
        .from(contract_clauses)
        .where(eq(contract_clauses.contract_id, contractId))
        .orderBy(contract_clauses.created_at)
    : await db.select().from(contract_clauses).orderBy(desc(contract_clauses.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — clause detail
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const [clause] = await db
    .select()
    .from(contract_clauses)
    .where(eq(contract_clauses.id, c.req.param('id')))
  if (!clause) return c.json({ error: 'Not found' }, 404)
  return c.json({ clause })
})

// ---------------------------------------------------------------------------
// POST / — auth — create clause (parent-contract ownership check)
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', clauseSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [parent] = await db.select().from(contracts).where(eq(contracts.id, body.contract_id))
  if (!parent) return c.json({ error: 'Contract not found' }, 404)
  if (parent.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(contract_clauses)
    .values({
      contract_id: body.contract_id,
      user_id: userId,
      clause_type: body.clause_type,
      title: body.title,
      citation_text: body.citation_text ?? '',
      cap_pct: body.cap_pct ?? null,
      cumulative_cap_pct: body.cumulative_cap_pct ?? null,
      notice_days: body.notice_days ?? null,
      fixed_start_date: toDate(body.fixed_start_date) ?? null,
      fixed_end_date: toDate(body.fixed_end_date) ?? null,
      index_id: body.index_id ?? null,
      index_basket: body.index_basket ?? [],
      config: body.config ?? {},
    })
    .returning()
  return c.json({ clause: created }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update clause (ownership check)
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', clauseUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contract_clauses).where(eq(contract_clauses.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.clause_type !== undefined) patch.clause_type = body.clause_type
  if (body.title !== undefined) patch.title = body.title
  if (body.citation_text !== undefined) patch.citation_text = body.citation_text
  if (body.cap_pct !== undefined) patch.cap_pct = body.cap_pct
  if (body.cumulative_cap_pct !== undefined) patch.cumulative_cap_pct = body.cumulative_cap_pct
  if (body.notice_days !== undefined) patch.notice_days = body.notice_days
  if (body.fixed_start_date !== undefined) patch.fixed_start_date = toDate(body.fixed_start_date)
  if (body.fixed_end_date !== undefined) patch.fixed_end_date = toDate(body.fixed_end_date)
  if (body.index_id !== undefined) patch.index_id = body.index_id
  if (body.index_basket !== undefined) patch.index_basket = body.index_basket
  if (body.config !== undefined) patch.config = body.config
  const [updated] = await db
    .update(contract_clauses)
    .set(patch)
    .where(eq(contract_clauses.id, id))
    .returning()
  return c.json({ clause: updated })
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete clause (ownership check)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contract_clauses).where(eq(contract_clauses.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(contract_clauses).where(eq(contract_clauses.id, id))
  return c.json({ success: true })
})

export default router
