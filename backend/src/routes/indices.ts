import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { indices, index_data_points } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const indexSchema = z.object({
  workspace_id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  source: z.string().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
})

const indexUpdateSchema = indexSchema.partial().omit({ workspace_id: true })

// ---------------------------------------------------------------------------
// GET / — public — list indices (optional ?workspace_id)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(indices)
        .where(eq(indices.workspace_id, workspaceId))
        .orderBy(desc(indices.created_at))
    : await db.select().from(indices).orderBy(desc(indices.created_at))
  return c.json(rows)
})

// ---------------------------------------------------------------------------
// GET /:id — public — index detail with data points
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [index] = await db.select().from(indices).where(eq(indices.id, id))
  if (!index) return c.json({ error: 'Not found' }, 404)
  const data_points = await db
    .select()
    .from(index_data_points)
    .where(eq(index_data_points.index_id, id))
    .orderBy(index_data_points.period)
  return c.json({ index, data_points })
})

// ---------------------------------------------------------------------------
// POST / — auth — create index
// ---------------------------------------------------------------------------

router.post('/', authMiddleware, zValidator('json', indexSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(indices)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      code: body.code,
      name: body.name,
      source: body.source ?? '',
      unit: body.unit ?? 'index',
      description: body.description ?? '',
    })
    .returning()
  return c.json({ index: created }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — auth — update index (ownership check)
// ---------------------------------------------------------------------------

router.put('/:id', authMiddleware, zValidator('json', indexUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(indices).where(eq(indices.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  if (body.code !== undefined) patch.code = body.code
  if (body.name !== undefined) patch.name = body.name
  if (body.source !== undefined) patch.source = body.source
  if (body.unit !== undefined) patch.unit = body.unit
  if (body.description !== undefined) patch.description = body.description
  const [updated] = await db.update(indices).set(patch).where(eq(indices.id, id)).returning()
  return c.json({ index: updated })
})

// ---------------------------------------------------------------------------
// DELETE /:id — auth — delete index (and its data points) (ownership check)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(indices).where(eq(indices.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(index_data_points).where(eq(index_data_points.index_id, id))
  await db.delete(indices).where(eq(indices.id, id))
  return c.json({ success: true })
})

export default router
