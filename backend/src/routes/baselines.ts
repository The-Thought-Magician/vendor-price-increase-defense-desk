import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { spend_baselines, workspaces, suppliers } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const baselineSchema = z.object({
  workspace_id: z.string().min(1),
  supplier_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  period: z.string().min(1),
  annual_spend_cents: z.number().int().nonnegative().optional().default(0),
})

const baselineUpdateSchema = z.object({
  supplier_id: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  period: z.string().min(1).optional(),
  annual_spend_cents: z.number().int().nonnegative().optional(),
})

// Public: list spend baselines, optionally filtered by ?supplier_id (or ?workspace_id)
router.get('/', async (c) => {
  const supplierId = c.req.query('supplier_id')
  const workspaceId = c.req.query('workspace_id')
  const filters = []
  if (supplierId) filters.push(eq(spend_baselines.supplier_id, supplierId))
  if (workspaceId) filters.push(eq(spend_baselines.workspace_id, workspaceId))
  const rows = filters.length
    ? await db
        .select()
        .from(spend_baselines)
        .where(filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(spend_baselines.created_at))
    : await db.select().from(spend_baselines).orderBy(desc(spend_baselines.created_at))
  return c.json(rows)
})

// Auth: create a spend baseline (workspace ownership enforced)
router.post('/', authMiddleware, zValidator('json', baselineSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, body.workspace_id))
  if (!ws) return c.json({ error: 'Workspace not found' }, 404)
  if (ws.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // If a supplier is referenced, it must belong to the same workspace
  if (body.supplier_id) {
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, body.supplier_id))
    if (!sup) return c.json({ error: 'Supplier not found' }, 404)
    if (sup.workspace_id !== body.workspace_id) {
      return c.json({ error: 'Supplier not in workspace' }, 400)
    }
  }

  const [created] = await db
    .insert(spend_baselines)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      supplier_id: body.supplier_id ?? null,
      category_id: body.category_id ?? null,
      period: body.period,
      annual_spend_cents: body.annual_spend_cents ?? 0,
    })
    .returning()
  return c.json({ baseline: created }, 201)
})

// Auth: update a baseline (owner only)
router.put('/:id', authMiddleware, zValidator('json', baselineUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(spend_baselines).where(eq(spend_baselines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(spend_baselines)
    .set({
      ...(body.supplier_id !== undefined ? { supplier_id: body.supplier_id } : {}),
      ...(body.category_id !== undefined ? { category_id: body.category_id } : {}),
      ...(body.period !== undefined ? { period: body.period } : {}),
      ...(body.annual_spend_cents !== undefined
        ? { annual_spend_cents: body.annual_spend_cents }
        : {}),
    })
    .where(eq(spend_baselines.id, id))
    .returning()
  return c.json({ baseline: updated })
})

// Auth: delete a baseline (owner only)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(spend_baselines).where(eq(spend_baselines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(spend_baselines).where(eq(spend_baselines.id, id))
  return c.json({ success: true })
})

export default router
