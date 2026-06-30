import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { playbooks } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const ruleSchema = z.object({ condition: z.string().min(1), action: z.string().min(1) })

const createSchema = z.object({
  workspace_id: z.string().min(1),
  name: z.string().min(1),
  category_id: z.string().min(1).optional().nullable(),
  contest_over_ask_pct: z.number().optional().default(1),
  auto_accept_within_index: z.boolean().optional().default(true),
  auto_accept_under_cap: z.boolean().optional().default(true),
  rules: z.array(ruleSchema).optional().default([]),
  is_active: z.boolean().optional().default(true),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  category_id: z.string().min(1).optional().nullable(),
  contest_over_ask_pct: z.number().optional(),
  auto_accept_within_index: z.boolean().optional(),
  auto_accept_under_cap: z.boolean().optional(),
  rules: z.array(ruleSchema).optional(),
  is_active: z.boolean().optional(),
})

// Public: list playbooks (optional ?workspace_id, ?category_id)
router.get('/', async (c) => {
  const workspaceId = c.req.query('workspace_id')
  const categoryId = c.req.query('category_id')
  const conds = []
  if (workspaceId) conds.push(eq(playbooks.workspace_id, workspaceId))
  if (categoryId) conds.push(eq(playbooks.category_id, categoryId))
  const rows = conds.length
    ? await db.select().from(playbooks).where(and(...conds)).orderBy(desc(playbooks.created_at))
    : await db.select().from(playbooks).orderBy(desc(playbooks.created_at))
  return c.json(rows)
})

// Public: playbook detail
router.get('/:id', async (c) => {
  const [row] = await db.select().from(playbooks).where(eq(playbooks.id, c.req.param('id')))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json({ playbook: row })
})

// Auth: create. Auto-accept/contest threshold rules are normalized so the stored
// `rules` array always reflects the toggles + the contest threshold.
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const rules = buildRules(body)
  const [row] = await db
    .insert(playbooks)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      name: body.name,
      category_id: body.category_id ?? null,
      contest_over_ask_pct: body.contest_over_ask_pct,
      auto_accept_within_index: body.auto_accept_within_index,
      auto_accept_under_cap: body.auto_accept_under_cap,
      rules,
      is_active: body.is_active,
    })
    .returning()
  return c.json(row, 201)
})

// Auth: update
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(playbooks).where(eq(playbooks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const set: Record<string, unknown> = {}
  if (body.name !== undefined) set.name = body.name
  if (body.category_id !== undefined) set.category_id = body.category_id
  if (body.contest_over_ask_pct !== undefined) set.contest_over_ask_pct = body.contest_over_ask_pct
  if (body.auto_accept_within_index !== undefined) set.auto_accept_within_index = body.auto_accept_within_index
  if (body.auto_accept_under_cap !== undefined) set.auto_accept_under_cap = body.auto_accept_under_cap
  if (body.is_active !== undefined) set.is_active = body.is_active
  // Recompute rules when any rule-affecting field or explicit rules array changes.
  if (
    body.rules !== undefined ||
    body.contest_over_ask_pct !== undefined ||
    body.auto_accept_within_index !== undefined ||
    body.auto_accept_under_cap !== undefined
  ) {
    set.rules = buildRules({
      contest_over_ask_pct: body.contest_over_ask_pct ?? existing.contest_over_ask_pct,
      auto_accept_within_index: body.auto_accept_within_index ?? existing.auto_accept_within_index,
      auto_accept_under_cap: body.auto_accept_under_cap ?? existing.auto_accept_under_cap,
      rules: body.rules ?? [],
    })
  }
  if (Object.keys(set).length === 0) return c.json(existing)
  const [updated] = await db.update(playbooks).set(set).where(eq(playbooks.id, id)).returning()
  return c.json(updated)
})

// Auth: delete
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(playbooks).where(eq(playbooks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(playbooks).where(eq(playbooks.id, id))
  return c.json({ success: true })
})

// Derive the canonical rule set from the auto-accept/contest threshold toggles,
// merging any caller-supplied custom rules on top.
function buildRules(input: {
  contest_over_ask_pct: number
  auto_accept_within_index: boolean
  auto_accept_under_cap: boolean
  rules: Array<{ condition: string; action: string }>
}): Array<{ condition: string; action: string }> {
  const derived: Array<{ condition: string; action: string }> = []
  if (input.auto_accept_within_index) {
    derived.push({ condition: 'increase_within_index_entitlement', action: 'auto_accept' })
  }
  if (input.auto_accept_under_cap) {
    derived.push({ condition: 'increase_under_contract_cap', action: 'auto_accept' })
  }
  derived.push({
    condition: `over_ask_pct >= ${input.contest_over_ask_pct}`,
    action: 'contest',
  })
  // Append caller custom rules that aren't duplicates of the derived ones.
  for (const r of input.rules ?? []) {
    if (!derived.some((d) => d.condition === r.condition && d.action === r.action)) {
      derived.push(r)
    }
  }
  return derived
}

export default router
