import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { documents, increase_letters, contracts } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const documentSchema = z.object({
  workspace_id: z.string().min(1),
  letter_id: z.string().min(1).optional().nullable(),
  contract_id: z.string().min(1).optional().nullable(),
  name: z.string().min(1),
  doc_type: z.enum(['attachment', 'snippet']).optional().default('attachment'),
  content: z.string().optional().default(''),
  url: z.string().optional().default(''),
})

// Public: list documents / reusable clause-citation snippets.
// Filterable by ?letter_id and ?doc_type.
router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  const docType = c.req.query('doc_type')
  const filters = []
  if (letterId) filters.push(eq(documents.letter_id, letterId))
  if (docType) filters.push(eq(documents.doc_type, docType))
  const rows = filters.length
    ? await db
        .select()
        .from(documents)
        .where(filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(documents.created_at))
    : await db.select().from(documents).orderBy(desc(documents.created_at))
  return c.json(rows)
})

// Public: document detail.
router.get('/:id', async (c) => {
  const [doc] = await db.select().from(documents).where(eq(documents.id, c.req.param('id')))
  if (!doc) return c.json({ error: 'Not found' }, 404)
  return c.json({ document: doc })
})

// Auth: create a document or reusable clause-citation snippet.
router.post('/', authMiddleware, zValidator('json', documentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Ownership: if linked to a letter, the letter must belong to the user.
  if (body.letter_id) {
    const [letter] = await db
      .select()
      .from(increase_letters)
      .where(eq(increase_letters.id, body.letter_id))
    if (!letter) return c.json({ error: 'Letter not found' }, 404)
    if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  }
  // Ownership: if linked to a contract, the contract must belong to the user.
  if (body.contract_id) {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, body.contract_id))
    if (!contract) return c.json({ error: 'Contract not found' }, 404)
    if (contract.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  }

  const [doc] = await db
    .insert(documents)
    .values({
      workspace_id: body.workspace_id,
      user_id: userId,
      letter_id: body.letter_id ?? null,
      contract_id: body.contract_id ?? null,
      name: body.name,
      doc_type: body.doc_type,
      content: body.content,
      url: body.url,
    })
    .returning()
  return c.json({ document: doc }, 201)
})

// Auth: update a document / snippet (ownership enforced).
router.put('/:id', authMiddleware, zValidator('json', documentSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(documents).where(eq(documents.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const patch: Record<string, unknown> = {}
  for (const k of ['name', 'doc_type', 'content', 'url', 'letter_id', 'contract_id'] as const) {
    if (body[k] !== undefined) patch[k] = body[k]
  }
  const [updated] = await db.update(documents).set(patch).where(eq(documents.id, id)).returning()
  return c.json({ document: updated })
})

// Auth: delete a document / snippet (ownership enforced).
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(documents).where(eq(documents.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(documents).where(eq(documents.id, id))
  return c.json({ success: true })
})

export default router
