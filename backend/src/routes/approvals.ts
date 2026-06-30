import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { approvals, approval_steps, increase_letters } from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createSchema = z.object({
  workspace_id: z.string().min(1),
  letter_id: z.string().min(1),
  decision_note: z.string().optional().default(''),
  steps: z
    .array(
      z.object({
        step_order: z.number().int().optional(),
        role: z.enum(['reviewer', 'approver']).optional().default('reviewer'),
        note: z.string().optional().default(''),
      }),
    )
    .optional()
    .default([]),
})

const decideSchema = z.object({
  step_id: z.string().min(1),
  status: z.enum(['approved', 'rejected']),
  note: z.string().optional().default(''),
})

async function loadSteps(approvalId: string) {
  return db
    .select()
    .from(approval_steps)
    .where(eq(approval_steps.approval_id, approvalId))
    .orderBy(asc(approval_steps.step_order))
}

// Public: list approvals (filter ?status, ?letter_id, ?workspace_id) with steps
router.get('/', async (c) => {
  const status = c.req.query('status')
  const letterId = c.req.query('letter_id')
  const workspaceId = c.req.query('workspace_id')
  const conditions = []
  if (status) conditions.push(eq(approvals.status, status))
  if (letterId) conditions.push(eq(approvals.letter_id, letterId))
  if (workspaceId) conditions.push(eq(approvals.workspace_id, workspaceId))
  const rows = conditions.length
    ? await db
        .select()
        .from(approvals)
        .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        .orderBy(desc(approvals.created_at))
    : await db.select().from(approvals).orderBy(desc(approvals.created_at))
  const withSteps = await Promise.all(
    rows.map(async (a) => ({ ...a, steps: await loadSteps(a.id) })),
  )
  return c.json(withSteps)
})

// Public: approval detail with steps
router.get('/:id', async (c) => {
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, c.req.param('id')))
  if (!approval) return c.json({ error: 'Not found' }, 404)
  const steps = await loadSteps(approval.id)
  return c.json({ approval, steps })
})

// Auth: create approval (+ steps) for a letter
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Ownership: the letter must exist and belong to the requesting user.
  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, body.letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [approval] = await db
    .insert(approvals)
    .values({
      workspace_id: body.workspace_id,
      letter_id: body.letter_id,
      user_id: userId,
      status: 'pending',
      decision_note: body.decision_note ?? '',
    })
    .returning()

  // Build steps: explicit list or a single default approver step.
  const stepInputs =
    body.steps.length > 0
      ? body.steps
      : [{ step_order: 0, role: 'approver' as const, note: '' }]

  const stepRows = stepInputs.map((s, i) => ({
    approval_id: approval.id,
    user_id: userId,
    step_order: s.step_order ?? i,
    role: s.role ?? 'reviewer',
    status: 'pending',
    note: s.note ?? '',
  }))

  const steps = await db.insert(approval_steps).values(stepRows).returning()
  steps.sort((a, b) => a.step_order - b.step_order)

  return c.json({ approval, steps }, 201)
})

// Auth: decide a step, advance/close the approval
router.post('/:id/decide', authMiddleware, zValidator('json', decideSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { step_id, status, note } = c.req.valid('json')

  const [approval] = await db.select().from(approvals).where(eq(approvals.id, id))
  if (!approval) return c.json({ error: 'Not found' }, 404)
  if (approval.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [step] = await db
    .select()
    .from(approval_steps)
    .where(and(eq(approval_steps.id, step_id), eq(approval_steps.approval_id, id)))
  if (!step) return c.json({ error: 'Step not found' }, 404)

  // Decide the step.
  await db
    .update(approval_steps)
    .set({ status, note: note ?? '', decided_by: userId, decided_at: new Date() })
    .where(eq(approval_steps.id, step_id))

  // Recompute approval status from all steps.
  const steps = await loadSteps(id)
  let nextStatus = approval.status
  if (steps.some((s) => s.status === 'rejected')) {
    nextStatus = 'rejected'
  } else if (steps.length > 0 && steps.every((s) => s.status === 'approved')) {
    nextStatus = 'approved'
  } else {
    nextStatus = 'pending'
  }

  const [updated] = await db
    .update(approvals)
    .set({ status: nextStatus, decision_note: note ?? approval.decision_note, updated_at: new Date() })
    .where(eq(approvals.id, id))
    .returning()

  return c.json({ approval: updated, steps })
})

// Auth: delete approval (and its steps)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(approvals).where(eq(approvals.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(approval_steps).where(eq(approval_steps.approval_id, id))
  await db.delete(approvals).where(eq(approvals.id, id))
  return c.json({ success: true })
})

export default router
