import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { workspaces } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  name: z.string().min(1),
  default_currency: z.string().min(1).optional(),
  approval_threshold_cents: z.number().int().min(0).optional(),
  contest_over_ask_pct: z.number().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
})

const updateSchema = createSchema.partial()

// GET /current — current user's workspace, auto-create if none.
router.get('/current', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .orderBy(workspaces.created_at)
    .limit(1)
  if (existing) return c.json({ workspace: existing })
  const [created] = await db
    .insert(workspaces)
    .values({ user_id: userId, name: 'My Workspace' })
    .returning()
  return c.json({ workspace: created })
})

// GET / — list user's workspaces.
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const all = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, userId))
    .orderBy(desc(workspaces.created_at))
  return c.json(all)
})

// POST / — create workspace.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(workspaces)
    .values({ ...body, user_id: userId })
    .returning()
  return c.json({ workspace: created }, 201)
})

// PUT /:id — update workspace settings.
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(workspaces)
    .set({ ...body, updated_at: new Date() })
    .where(eq(workspaces.id, id))
    .returning()
  return c.json({ workspace: updated })
})

export default router
