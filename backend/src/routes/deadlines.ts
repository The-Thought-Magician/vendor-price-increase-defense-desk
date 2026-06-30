import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { deadlines } from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  workspace_id: z.string().min(1),
  letter_id: z.string().min(1).optional().nullable(),
  contract_id: z.string().min(1).optional().nullable(),
  kind: z.enum(['response', 'notice', 'effective', 'sla']).optional().default('response'),
  title: z.string().min(1),
  due_date: z.string().min(1),
  status: z.enum(['open', 'done', 'overdue']).optional().default('open'),
})

const updateSchema = z.object({
  letter_id: z.string().min(1).optional().nullable(),
  contract_id: z.string().min(1).optional().nullable(),
  kind: z.enum(['response', 'notice', 'effective', 'sla']).optional(),
  title: z.string().min(1).optional(),
  due_date: z.string().min(1).optional(),
  status: z.enum(['open', 'done', 'overdue']).optional(),
})

// Public: list deadlines (filter ?status, optional ?workspace_id)
router.get('/', async (c) => {
  const status = c.req.query('status')
  const workspaceId = c.req.query('workspace_id')
  const conds = []
  if (status) conds.push(eq(deadlines.status, status))
  if (workspaceId) conds.push(eq(deadlines.workspace_id, workspaceId))
  const rows = conds.length
    ? await db.select().from(deadlines).where(and(...conds)).orderBy(asc(deadlines.due_date))
    : await db.select().from(deadlines).orderBy(asc(deadlines.due_date))
  return c.json(rows)
})

// Public: upcoming + overdue deadlines. Overdue = open and due_date < now.
router.get('/upcoming', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const base = workspaceId
    ? await db.select().from(deadlines).where(eq(deadlines.workspace_id, workspaceId)).orderBy(asc(deadlines.due_date))
    : await db.select().from(deadlines).orderBy(asc(deadlines.due_date))
  const now = Date.now()
  const upcoming: typeof base = []
  const overdue: typeof base = []
  for (const d of base) {
    if (d.status === 'done') continue
    const due = d.due_date ? new Date(d.due_date).getTime() : NaN
    if (!Number.isNaN(due) && due < now) {
      overdue.push(d)
    } else {
      upcoming.push(d)
    }
  }
  return c.json({ upcoming, overdue })
})

// Auth: create deadline
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [row] = await db
    .insert(deadlines)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      letter_id: body.letter_id ?? null,
      contract_id: body.contract_id ?? null,
      kind: body.kind,
      title: body.title,
      due_date: new Date(body.due_date),
      status: body.status,
    })
    .returning()
  return c.json(row, 201)
})

// Auth: update (e.g. mark done)
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(deadlines).where(eq(deadlines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const set: Record<string, unknown> = {}
  if (body.letter_id !== undefined) set.letter_id = body.letter_id
  if (body.contract_id !== undefined) set.contract_id = body.contract_id
  if (body.kind !== undefined) set.kind = body.kind
  if (body.title !== undefined) set.title = body.title
  if (body.due_date !== undefined) set.due_date = new Date(body.due_date)
  if (body.status !== undefined) set.status = body.status
  if (Object.keys(set).length === 0) return c.json(existing)
  const [updated] = await db.update(deadlines).set(set).where(eq(deadlines.id, id)).returning()
  return c.json(updated)
})

// Auth: delete
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(deadlines).where(eq(deadlines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(deadlines).where(eq(deadlines.id, id))
  return c.json({ success: true })
})

export default router
