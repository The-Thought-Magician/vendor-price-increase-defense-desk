import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { rebuttal_templates } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const BREACH_TYPES = ['over_cap', 'index_over_ask', 'fixed_price', 'insufficient_notice', 'cumulative'] as const

const templateSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  breach_type: z.enum(BREACH_TYPES),
  tone: z.string().min(1).optional().default('firm'),
  body: z.string().min(1),
})

// Public: list rebuttal templates, optionally filtered by ?breach_type and ?workspace_id
router.get('/', async (c) => {
  const breachType = c.req.query('breach_type')
  const workspaceId = c.req.query('workspace_id')
  const conditions = []
  if (breachType) conditions.push(eq(rebuttal_templates.breach_type, breachType))
  if (workspaceId) conditions.push(eq(rebuttal_templates.workspace_id, workspaceId))
  const rows = conditions.length
    ? await db
        .select()
        .from(rebuttal_templates)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(rebuttal_templates.created_at))
    : await db.select().from(rebuttal_templates).orderBy(desc(rebuttal_templates.created_at))
  return c.json(rows)
})

// Public: template detail
router.get('/:id', async (c) => {
  const [template] = await db
    .select()
    .from(rebuttal_templates)
    .where(eq(rebuttal_templates.id, c.req.param('id')))
  if (!template) return c.json({ error: 'Not found' }, 404)
  return c.json({ template })
})

// Auth: create template
router.post('/', authMiddleware, zValidator('json', templateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [template] = await db
    .insert(rebuttal_templates)
    .values({ ...body, user_id: userId })
    .returning()
  return c.json({ template }, 201)
})

// Auth: update template
router.put('/:id', authMiddleware, zValidator('json', templateSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(rebuttal_templates)
    .where(eq(rebuttal_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(rebuttal_templates)
    .set(body)
    .where(eq(rebuttal_templates.id, id))
    .returning()
  return c.json({ template: updated })
})

// Auth: delete template
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(rebuttal_templates)
    .where(eq(rebuttal_templates.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(rebuttal_templates).where(eq(rebuttal_templates.id, id))
  return c.json({ success: true })
})

export default router
