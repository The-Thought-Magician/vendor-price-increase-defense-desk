import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { categories, workspaces } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  parent_id: z.string().nullable().optional(),
  description: z.string().optional(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().nullable().optional(),
  description: z.string().optional(),
})

// GET / — list categories (workspace-scoped via ?workspace_id). Public read.
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const rows = workspaceId
    ? await db
        .select()
        .from(categories)
        .where(eq(categories.workspace_id, workspaceId))
        .orderBy(desc(categories.created_at))
    : await db.select().from(categories).orderBy(desc(categories.created_at))
  return c.json(rows)
})

// GET /:id — category detail. Public read.
router.get('/:id', async (c) => {
  const [row] = await db.select().from(categories).where(eq(categories.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ category: row })
})

// POST / — create. Auth + workspace ownership check.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, body.workspace_id))
  if (!ws) return c.json({ error: 'Workspace not found' }, 404)
  if (ws.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [created] = await db
    .insert(categories)
    .values({ ...body, user_id: userId })
    .returning()
  return c.json({ category: created }, 201)
})

// PUT /:id — update. Auth + ownership check.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(categories).where(eq(categories.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db.update(categories).set(body).where(eq(categories.id, id)).returning()
  return c.json({ category: updated })
})

// DELETE /:id — delete. Auth + ownership check.
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(categories).where(eq(categories.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(categories).where(eq(categories.id, id))
  return c.json({ success: true })
})

export default router
