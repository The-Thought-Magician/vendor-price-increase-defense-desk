import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { audit_events } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const recordSchema = z.object({
  workspace_id: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  action: z.string().min(1),
  actor: z.string().optional().default(''),
  detail: z.record(z.string(), z.unknown()).optional().default({}),
})

// Public: list audit events (filter ?entity_type, ?entity_id, ?workspace_id, ?action)
router.get('/', async (c) => {
  const entityType = c.req.query('entity_type')
  const entityId = c.req.query('entity_id')
  const workspaceId = c.req.query('workspace_id')
  const action = c.req.query('action')
  const conditions = []
  if (entityType) conditions.push(eq(audit_events.entity_type, entityType))
  if (entityId) conditions.push(eq(audit_events.entity_id, entityId))
  if (workspaceId) conditions.push(eq(audit_events.workspace_id, workspaceId))
  if (action) conditions.push(eq(audit_events.action, action))
  const rows = conditions.length
    ? await db
        .select()
        .from(audit_events)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(audit_events.created_at))
    : await db.select().from(audit_events).orderBy(desc(audit_events.created_at))
  return c.json(rows)
})

// Auth: record an immutable audit event (append-only — no update/delete exposed)
router.post('/', authMiddleware, zValidator('json', recordSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [event] = await db
    .insert(audit_events)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      action: body.action,
      actor: body.actor || userId,
      detail: body.detail ?? {},
    })
    .returning()
  return c.json({ event }, 201)
})

export default router
