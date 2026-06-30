import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  increase_letters,
  letter_line_items,
  clause_checks,
  index_validations,
  cumulative_creep_records,
  pushback_packets,
  suppliers,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Lifecycle status set (matches schema comment):
// draft|logged|under_review|packet_ready|sent|accepted|contested|withdrawn|resolved
const STATUSES = [
  'draft',
  'logged',
  'under_review',
  'packet_ready',
  'sent',
  'accepted',
  'contested',
  'withdrawn',
  'resolved',
] as const

const lineItemSchema = z.object({
  sku: z.string().optional().default(''),
  description: z.string().min(1),
  current_price_cents: z.number().int().nonnegative().optional().default(0),
  proposed_price_cents: z.number().int().nonnegative().optional().default(0),
  proposed_pct: z.number().nullable().optional(),
  annual_volume: z.number().int().nonnegative().optional().default(0),
})

const letterSchema = z.object({
  workspace_id: z.string().min(1),
  supplier_id: z.string().min(1),
  contract_id: z.string().nullable().optional(),
  title: z.string().min(1),
  proposed_pct: z.number().nullable().optional(),
  effective_date: z.string().datetime().nullable().optional(),
  received_date: z.string().datetime().nullable().optional(),
  justification: z.string().optional().default(''),
  raw_text: z.string().optional().default(''),
  sender_contact: z.string().optional().default(''),
  status: z.enum(STATUSES).optional(),
  line_items: z.array(lineItemSchema).optional().default([]),
})

const letterUpdateSchema = letterSchema.partial().omit({ line_items: true })

const statusSchema = z.object({
  status: z.enum(STATUSES),
})

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Compute annual impact (cents) from line items if present, else fall back to 0.
function lineItemsAnnualImpact(
  items: Array<{
    current_price_cents: number
    proposed_price_cents: number
    annual_volume: number
  }>,
): number {
  let total = 0
  for (const it of items) {
    total += (it.proposed_price_cents - it.current_price_cents) * it.annual_volume
  }
  return Math.round(total)
}

// Public: list letters (filter ?status, ?supplier_id)
router.get('/', async (c) => {
  const status = c.req.query('status')
  const supplierId = c.req.query('supplier_id')
  const conds = []
  if (status) conds.push(eq(increase_letters.status, status))
  if (supplierId) conds.push(eq(increase_letters.supplier_id, supplierId))
  const rows = await db
    .select()
    .from(increase_letters)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(increase_letters.created_at))
  return c.json(rows)
})

// Public: letter detail with related analysis records
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [letter] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!letter) return c.json({ error: 'Not found' }, 404)

  const [line_items, checks, validations, creep, packets] = await Promise.all([
    db
      .select()
      .from(letter_line_items)
      .where(eq(letter_line_items.letter_id, id))
      .orderBy(letter_line_items.created_at),
    db
      .select()
      .from(clause_checks)
      .where(eq(clause_checks.letter_id, id))
      .orderBy(desc(clause_checks.created_at)),
    db
      .select()
      .from(index_validations)
      .where(eq(index_validations.letter_id, id))
      .orderBy(desc(index_validations.created_at)),
    db
      .select()
      .from(cumulative_creep_records)
      .where(eq(cumulative_creep_records.letter_id, id))
      .orderBy(desc(cumulative_creep_records.created_at)),
    db
      .select()
      .from(pushback_packets)
      .where(eq(pushback_packets.letter_id, id))
      .orderBy(desc(pushback_packets.created_at)),
  ])

  return c.json({
    letter,
    line_items,
    clause_checks: checks,
    index_validations: validations,
    creep,
    packets,
  })
})

// Public: list line items
router.get('/:id/line-items', async (c) => {
  const id = c.req.param('id')
  const rows = await db
    .select()
    .from(letter_line_items)
    .where(eq(letter_line_items.letter_id, id))
    .orderBy(letter_line_items.created_at)
  return c.json(rows)
})

// Auth: create letter (+ optional line items)
router.post('/', authMiddleware, zValidator('json', letterSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // ownership: supplier must belong to the user
  const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, body.supplier_id))
  if (!sup) return c.json({ error: 'Supplier not found' }, 404)
  if (sup.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const items = body.line_items ?? []
  const annualImpact = items.length ? lineItemsAnnualImpact(
    items.map((i) => ({
      current_price_cents: i.current_price_cents ?? 0,
      proposed_price_cents: i.proposed_price_cents ?? 0,
      annual_volume: i.annual_volume ?? 0,
    })),
  ) : 0

  const [letter] = await db
    .insert(increase_letters)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      supplier_id: body.supplier_id,
      contract_id: body.contract_id ?? null,
      title: body.title,
      proposed_pct: body.proposed_pct ?? null,
      effective_date: toDate(body.effective_date),
      received_date: toDate(body.received_date),
      justification: body.justification ?? '',
      raw_text: body.raw_text ?? '',
      sender_contact: body.sender_contact ?? '',
      status: body.status ?? 'logged',
      annual_impact_cents: annualImpact,
    })
    .returning()

  if (items.length) {
    await db.insert(letter_line_items).values(
      items.map((i) => ({
        letter_id: letter.id,
        user_id: userId,
        sku: i.sku ?? '',
        description: i.description,
        current_price_cents: i.current_price_cents ?? 0,
        proposed_price_cents: i.proposed_price_cents ?? 0,
        proposed_pct: i.proposed_pct ?? null,
        annual_volume: i.annual_volume ?? 0,
      })),
    )
  }

  return c.json({ letter }, 201)
})

// Auth: update letter
router.put('/:id', authMiddleware, zValidator('json', letterUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const updates: Record<string, unknown> = { updated_at: new Date() }
  if (body.workspace_id !== undefined) updates.workspace_id = body.workspace_id
  if (body.supplier_id !== undefined) updates.supplier_id = body.supplier_id
  if (body.contract_id !== undefined) updates.contract_id = body.contract_id ?? null
  if (body.title !== undefined) updates.title = body.title
  if (body.proposed_pct !== undefined) updates.proposed_pct = body.proposed_pct ?? null
  if (body.effective_date !== undefined) updates.effective_date = toDate(body.effective_date)
  if (body.received_date !== undefined) updates.received_date = toDate(body.received_date)
  if (body.justification !== undefined) updates.justification = body.justification
  if (body.raw_text !== undefined) updates.raw_text = body.raw_text
  if (body.sender_contact !== undefined) updates.sender_contact = body.sender_contact
  if (body.status !== undefined) updates.status = body.status

  const [updated] = await db
    .update(increase_letters)
    .set(updates)
    .where(eq(increase_letters.id, id))
    .returning()
  return c.json({ letter: updated })
})

// Auth: transition lifecycle status
router.post('/:id/status', authMiddleware, zValidator('json', statusSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { status } = c.req.valid('json')
  const [existing] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(increase_letters)
    .set({ status, updated_at: new Date() })
    .where(eq(increase_letters.id, id))
    .returning()
  return c.json({ letter: updated })
})

// Auth: add a line item to a letter (recomputes annual impact)
router.post('/:id/line-items', authMiddleware, zValidator('json', lineItemSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [letter] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!letter) return c.json({ error: 'Not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [line_item] = await db
    .insert(letter_line_items)
    .values({
      letter_id: id,
      user_id: userId,
      sku: body.sku ?? '',
      description: body.description,
      current_price_cents: body.current_price_cents ?? 0,
      proposed_price_cents: body.proposed_price_cents ?? 0,
      proposed_pct: body.proposed_pct ?? null,
      annual_volume: body.annual_volume ?? 0,
    })
    .returning()

  // recompute annual impact across all line items
  const all = await db
    .select()
    .from(letter_line_items)
    .where(eq(letter_line_items.letter_id, id))
  await db
    .update(increase_letters)
    .set({ annual_impact_cents: lineItemsAnnualImpact(all), updated_at: new Date() })
    .where(eq(increase_letters.id, id))

  return c.json({ line_item }, 201)
})

// Auth: delete a line item (recomputes annual impact)
router.delete('/:id/line-items/:itemId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const itemId = c.req.param('itemId')
  const [letter] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!letter) return c.json({ error: 'Not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [item] = await db
    .select()
    .from(letter_line_items)
    .where(and(eq(letter_line_items.id, itemId), eq(letter_line_items.letter_id, id)))
  if (!item) return c.json({ error: 'Line item not found' }, 404)

  await db.delete(letter_line_items).where(eq(letter_line_items.id, itemId))

  const all = await db
    .select()
    .from(letter_line_items)
    .where(eq(letter_line_items.letter_id, id))
  await db
    .update(increase_letters)
    .set({ annual_impact_cents: lineItemsAnnualImpact(all), updated_at: new Date() })
    .where(eq(increase_letters.id, id))

  return c.json({ success: true })
})

// Auth: delete a letter (cascades dependent analysis rows)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(increase_letters).where(eq(increase_letters.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(letter_line_items).where(eq(letter_line_items.letter_id, id))
  await db.delete(clause_checks).where(eq(clause_checks.letter_id, id))
  await db.delete(index_validations).where(eq(index_validations.letter_id, id))
  await db.delete(cumulative_creep_records).where(eq(cumulative_creep_records.letter_id, id))
  await db.delete(increase_letters).where(eq(increase_letters.id, id))
  return c.json({ success: true })
})

export default router
