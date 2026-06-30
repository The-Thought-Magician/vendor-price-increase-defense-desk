import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { index_data_points, indices } from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const pointSchema = z.object({
  index_id: z.string().min(1),
  period: z.string().min(1),
  value: z.number(),
})

const importSchema = z.object({
  index_id: z.string().min(1),
  points: z
    .array(
      z.object({
        period: z.string().min(1),
        value: z.number(),
      }),
    )
    .min(1),
})

// Public: list data points by ?index_id (ordered by period)
router.get('/', async (c) => {
  const indexId = c.req.query('index_id')
  if (!indexId) {
    const all = await db.select().from(index_data_points).orderBy(asc(index_data_points.period))
    return c.json(all)
  }
  const rows = await db
    .select()
    .from(index_data_points)
    .where(eq(index_data_points.index_id, indexId))
    .orderBy(asc(index_data_points.period))
  return c.json(rows)
})

// Auth: add a data point (upsert on index_id+period)
router.post('/', authMiddleware, zValidator('json', pointSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // ownership: the parent index must belong to the user
  const [idx] = await db.select().from(indices).where(eq(indices.id, body.index_id))
  if (!idx) return c.json({ error: 'Index not found' }, 404)
  if (idx.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [point] = await db
    .insert(index_data_points)
    .values({
      index_id: body.index_id,
      user_id: userId,
      period: body.period,
      value: body.value,
    })
    .onConflictDoUpdate({
      target: [index_data_points.index_id, index_data_points.period],
      set: { value: body.value },
    })
    .returning()
  return c.json({ data_point: point }, 201)
})

// Auth: bulk import points { index_id, points[] } (upsert each)
router.post('/import', authMiddleware, zValidator('json', importSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [idx] = await db.select().from(indices).where(eq(indices.id, body.index_id))
  if (!idx) return c.json({ error: 'Index not found' }, 404)
  if (idx.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  let inserted = 0
  for (const p of body.points) {
    await db
      .insert(index_data_points)
      .values({
        index_id: body.index_id,
        user_id: userId,
        period: p.period,
        value: p.value,
      })
      .onConflictDoUpdate({
        target: [index_data_points.index_id, index_data_points.period],
        set: { value: p.value },
      })
    inserted++
  }
  return c.json({ inserted }, 201)
})

// Auth: delete a point
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(index_data_points)
    .where(eq(index_data_points.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db
    .delete(index_data_points)
    .where(and(eq(index_data_points.id, id), eq(index_data_points.user_id, userId)))
  return c.json({ success: true })
})

export default router
