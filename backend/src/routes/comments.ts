import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { comments, increase_letters } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const commentSchema = z.object({
  letter_id: z.string().min(1),
  body: z.string().min(1),
  author: z.string().optional().default(''),
})

// Public: list comments for a letter (most recent first), filtered by ?letter_id
router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  if (!letterId) return c.json({ error: 'letter_id is required' }, 400)
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.letter_id, letterId))
    .orderBy(desc(comments.created_at))
  return c.json(rows)
})

// Auth: add a comment to a letter's thread
router.post('/', authMiddleware, zValidator('json', commentSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // Ensure the parent letter exists before attaching a comment
  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, body.letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)

  const [created] = await db
    .insert(comments)
    .values({
      letter_id: body.letter_id,
      user_id: userId,
      author: body.author ?? '',
      body: body.body,
    })
    .returning()
  return c.json({ comment: created }, 201)
})

// Auth: delete a comment (author/owner only)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(comments).where(eq(comments.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(comments).where(and(eq(comments.id, id), eq(comments.user_id, userId)))
  return c.json({ success: true })
})

export default router
