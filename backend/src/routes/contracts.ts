import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { contracts, contract_clauses } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const contractSchema = z.object({
  workspace_id: z.string().min(1),
  supplier_id: z.string().min(1),
  name: z.string().min(1),
  reference_number: z.string().optional(),
  currency: z.string().optional(),
  effective_date: z.string().datetime().optional().nullable(),
  term_end_date: z.string().datetime().optional().nullable(),
  version: z.number().int().positive().optional(),
  governing_entity: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
})

const contractUpdateSchema = contractSchema.partial().omit({ workspace_id: true })

function toDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  return new Date(v)
}

// ---------------------------------------------------------------------------
// GET / — public — list contracts (optional ?workspace_id, ?supplier_id)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const supplierId = c.req.query('supplier_id')
  const filters = []
  if (workspaceId) filters.push(eq(contracts.workspace_id, workspaceId))
  if (supplierId) filters.push(eq(contracts.supplier_id, supplierId))
  const rows = filters.length
    ? await db.select().from(contracts).where(and(...filters)).orderBy(desc(contracts.created_at))
    : await db.select().from(contracts).orderBy(desc(contracts.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — contract detail with clauses
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!contract) return c.json({ error: 'Not found' }, 404)
  const clauses = await db
    .select()
    .from(contract_clauses)
    .where(eq(contract_clauses.contract_id, id))
    .orderBy(contract_clauses.created_at)
  return c.json({ contract, clauses })
})

// ---------------------------------------------------------------------------
// POST / — auth — create contract
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', contractSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(contracts)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      supplier_id: body.supplier_id,
      name: body.name,
      reference_number: body.reference_number ?? '',
      currency: body.currency ?? 'USD',
      effective_date: toDate(body.effective_date) ?? null,
      term_end_date: toDate(body.term_end_date) ?? null,
      version: body.version ?? 1,
      governing_entity: body.governing_entity ?? '',
      status: body.status ?? 'active',
      notes: body.notes ?? '',
    })
    .returning()
  return c.json({ contract: created }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update contract (ownership check)
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', contractUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.supplier_id !== undefined) patch.supplier_id = body.supplier_id
  if (body.name !== undefined) patch.name = body.name
  if (body.reference_number !== undefined) patch.reference_number = body.reference_number
  if (body.currency !== undefined) patch.currency = body.currency
  if (body.effective_date !== undefined) patch.effective_date = toDate(body.effective_date)
  if (body.term_end_date !== undefined) patch.term_end_date = toDate(body.term_end_date)
  if (body.version !== undefined) patch.version = body.version
  if (body.governing_entity !== undefined) patch.governing_entity = body.governing_entity
  if (body.status !== undefined) patch.status = body.status
  if (body.notes !== undefined) patch.notes = body.notes
  const [updated] = await db.update(contracts).set(patch).where(eq(contracts.id, id)).returning()
  return c.json({ contract: updated })
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete contract (and its clauses) (ownership check)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(contracts).where(eq(contracts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(contract_clauses).where(eq(contract_clauses.contract_id, id))
  await db.delete(contracts).where(eq(contracts.id, id))
  return c.json({ success: true })
})

export default router
