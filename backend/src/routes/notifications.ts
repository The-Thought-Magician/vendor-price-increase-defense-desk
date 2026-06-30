import { Hono } from 'hono'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Every endpoint is scoped to the authenticated user.
router.use('*', authMiddleware)

// Auth: current user's notifications (optional ?workspace_id, ?unread=1)
router.get('/', async (c) => {
  const userId = getUserId(c)
  const workspaceId = c.req.query('workspace_id')
  const unreadOnly = c.req.query('unread') === '1' || c.req.query('unread') === 'true'
  const conds = [eq(notifications.user_id, userId)]
  if (workspaceId) conds.push(eq(notifications.workspace_id, workspaceId))
  if (unreadOnly) conds.push(eq(notifications.read, false))
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.created_at))
  return c.json(rows)
})

// Auth: mark a single notification read (ownership enforced)
router.post('/:id/read', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .returning()
  return c.json(updated)
})

// Auth: mark all of the current user's notifications read
router.post('/read-all', async (c) => {
  const userId = getUserId(c)
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.user_id, userId), eq(notifications.read, false)))
  return c.json({ success: true })
})

// Auth: delete a notification (ownership enforced)
router.delete('/:id', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(notifications).where(eq(notifications.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(notifications).where(eq(notifications.id, id))
  return c.json({ success: true })
})

export default router
