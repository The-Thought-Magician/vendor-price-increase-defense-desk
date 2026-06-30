import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  pushback_packets,
  packet_sections,
  increase_letters,
  clause_checks,
  index_validations,
  cumulative_creep_records,
  rebuttal_templates,
  suppliers,
} from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const TONES = ['firm', 'collaborative', 'escalation'] as const
const SECTION_TYPES = ['summary', 'clause', 'index', 'creep', 'counter', 'custom'] as const

/** Map a clause-check verdict to a rebuttal-template breach_type. */
function breachTypeForClause(clauseType: string): string {
  switch (clauseType) {
    case 'annual_cap':
      return 'over_cap'
    case 'indexation':
      return 'index_over_ask'
    case 'fixed_price_period':
      return 'fixed_price'
    case 'notice_window':
      return 'insufficient_notice'
    case 'cumulative_cap':
      return 'cumulative'
    default:
      return 'over_cap'
  }
}

// ---------------------------------------------------------------------------
// GET / — list packets, filter by ?letter_id (public read)
// ---------------------------------------------------------------------------

router.get('/', async (c) => {
  const letterId = c.req.query('letter_id')
  if (letterId) {
    const rows = await db
      .select()
      .from(pushback_packets)
      .where(eq(pushback_packets.letter_id, letterId))
      .orderBy(desc(pushback_packets.created_at))
    return c.json(rows)
  }
  const all = await db
    .select()
    .from(pushback_packets)
    .orderBy(desc(pushback_packets.created_at))
  return c.json(all)
})

// ---------------------------------------------------------------------------
// GET /:id — packet detail with sections (public read)
// ---------------------------------------------------------------------------

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [packet] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
  if (!packet) return c.json({ error: 'Not found' }, 404)
  const sections = await db
    .select()
    .from(packet_sections)
    .where(eq(packet_sections.packet_id, id))
    .orderBy(asc(packet_sections.position))
  return c.json({ packet, sections })
})

// ---------------------------------------------------------------------------
// POST /generate — build a packet + sections from analysis artifacts.
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  letter_id: z.string().min(1),
  tone: z.enum(TONES).optional().default('firm'),
})

router.post('/generate', authMiddleware, zValidator('json', generateSchema), async (c) => {
  const userId = getUserId(c)
  const { letter_id, tone } = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, letter.supplier_id))
  const supplierName = supplier?.name ?? 'the supplier'

  // Pull analysis artifacts.
  const checks = await db
    .select()
    .from(clause_checks)
    .where(eq(clause_checks.letter_id, letter_id))
    .orderBy(desc(clause_checks.created_at))
  const validations = await db
    .select()
    .from(index_validations)
    .where(eq(index_validations.letter_id, letter_id))
    .orderBy(desc(index_validations.created_at))
  const creep = letter.contract_id
    ? await db
        .select()
        .from(cumulative_creep_records)
        .where(eq(cumulative_creep_records.contract_id, letter.contract_id))
        .orderBy(desc(cumulative_creep_records.created_at))
    : []
  const templates = await db
    .select()
    .from(rebuttal_templates)
    .where(eq(rebuttal_templates.workspace_id, letter.workspace_id))

  const templateFor = (breachType: string) =>
    templates.find((t) => t.breach_type === breachType && t.tone === tone) ??
    templates.find((t) => t.breach_type === breachType)

  const proposed = letter.proposed_pct ?? 0

  // Build sections.
  const sectionRows: Array<{ section_type: string; heading: string; content: string }> = []

  // 1) Summary
  const breaches = checks.filter((c2) => c2.verdict === 'breach')
  const partials = checks.filter((c2) => c2.verdict === 'partial')
  const breachCount = breaches.length
  const summaryLines: string[] = []
  summaryLines.push(
    `This response addresses the proposed ${round2(proposed)}% price increase from ${supplierName}` +
      (letter.title ? ` (re: ${letter.title}).` : '.'),
  )
  if (breachCount > 0) {
    summaryLines.push(
      `Our review identified ${breachCount} contractual breach(es)${
        partials.length ? ` and ${partials.length} partial concern(s)` : ''
      } in the proposal.`,
    )
  } else if (partials.length > 0) {
    summaryLines.push(`Our review identified ${partials.length} partial concern(s) in the proposal.`)
  } else {
    summaryLines.push('Our review found the proposal broadly consistent with contract terms, with the points below for clarification.')
  }
  if (letter.defensibility_score !== null && letter.defensibility_score !== undefined) {
    summaryLines.push(`Defensibility score: ${round2(letter.defensibility_score)}/100.`)
  }
  sectionRows.push({
    section_type: 'summary',
    heading: 'Summary',
    content: summaryLines.join(' '),
  })

  // 2) Clause sections — one per non-compliant check.
  for (const chk of checks) {
    if (chk.verdict === 'compliant') continue
    const breachType = breachTypeForClause(chk.clause_type)
    const tmpl = templateFor(breachType)
    const parts: string[] = []
    parts.push(chk.detail || `Clause check (${chk.clause_type}) returned verdict "${chk.verdict}".`)
    if (chk.citation_text) parts.push(`Contract citation: "${chk.citation_text}".`)
    if (chk.expected_value !== null && chk.actual_value !== null) {
      parts.push(
        `Contract permits ${round2(chk.expected_value)}% but the proposal seeks ${round2(
          chk.actual_value,
        )}%.`,
      )
    }
    if (tmpl) parts.push(tmpl.body)
    sectionRows.push({
      section_type: 'clause',
      heading: `Clause issue: ${chk.clause_type} (${chk.verdict}, ${chk.severity})`,
      content: parts.join('\n\n'),
    })
  }

  // 3) Index validation sections.
  for (const v of validations) {
    const parts: string[] = []
    parts.push(v.detail || 'Index validation result.')
    if (v.actual_pct !== null && v.claimed_pct !== null) {
      parts.push(
        `Published index movement (${v.base_period}→${v.current_period}) justifies ${round2(
          v.actual_pct,
        )}%, against the claimed ${round2(v.claimed_pct)}%.`,
      )
    }
    if (v.over_ask_pct !== null && v.over_ask_pct > 0) {
      const tmpl = templateFor('index_over_ask')
      if (tmpl) parts.push(tmpl.body)
    }
    sectionRows.push({
      section_type: 'index',
      heading: 'Index justification analysis',
      content: parts.join('\n\n'),
    })
  }

  // 4) Cumulative creep section (use the most recent record).
  const latestCreep = creep[0]
  if (latestCreep) {
    const parts: string[] = []
    parts.push(
      `Cumulative compounded increase under this contract stands at ${round2(
        latestCreep.cumulative_pct,
      )}%${
        latestCreep.cap_pct !== null ? `, against a multi-year cap of ${round2(latestCreep.cap_pct)}%` : ''
      }.`,
    )
    if (latestCreep.breached) {
      parts.push('This proposal would push cumulative increases beyond the contractual cumulative cap.')
      const tmpl = templateFor('cumulative')
      if (tmpl) parts.push(tmpl.body)
    }
    sectionRows.push({
      section_type: 'creep',
      heading: 'Cumulative increase (multi-year)',
      content: parts.join('\n\n'),
    })
  }

  // 5) Counter recommendation.
  // Recommend the most-defensible entitled figure: lowest index-entitled pct if
  // present, else the tightest clause cap, else a modest discount on the ask.
  let recommendedCounter = round2(proposed)
  const entitledVals = validations
    .map((v) => v.entitled_pct)
    .filter((x): x is number => x !== null && x !== undefined)
  const capVals = checks
    .map((chk) => chk.expected_value)
    .filter((x): x is number => x !== null && x !== undefined)
  if (entitledVals.length > 0) {
    recommendedCounter = round2(Math.min(...entitledVals))
  } else if (capVals.length > 0) {
    recommendedCounter = round2(Math.min(...capVals))
  } else if (breachCount > 0 || partials.length > 0) {
    recommendedCounter = round2(proposed / 2)
  }
  const counterParts: string[] = []
  counterParts.push(
    `Recommended counter-offer: ${recommendedCounter}% (vs the proposed ${round2(proposed)}%).`,
  )
  if (recommendedCounter < proposed) {
    counterParts.push(
      `This reflects the contractually-entitled and index-justified ceiling identified above.`,
    )
  }
  sectionRows.push({
    section_type: 'counter',
    heading: 'Recommended counter-position',
    content: counterParts.join('\n\n'),
  })

  // Compose the packet body from the sections.
  const body = sectionRows.map((s) => `## ${s.heading}\n\n${s.content}`).join('\n\n')

  const [packet] = await db
    .insert(pushback_packets)
    .values({
      letter_id,
      workspace_id: letter.workspace_id,
      user_id: userId,
      title: `Pushback packet — ${letter.title}`,
      tone,
      recommended_counter_pct: recommendedCounter,
      body,
      status: 'draft',
    })
    .returning()

  const inserted = []
  for (let i = 0; i < sectionRows.length; i++) {
    const s = sectionRows[i]
    const [row] = await db
      .insert(packet_sections)
      .values({
        packet_id: packet.id,
        user_id: userId,
        section_type: s.section_type,
        heading: s.heading,
        content: s.content,
        position: i,
      })
      .returning()
    inserted.push(row)
  }

  return c.json({ packet, sections: inserted }, 201)
})

// ---------------------------------------------------------------------------
// POST / — create a blank packet
// ---------------------------------------------------------------------------

const createSchema = z.object({
  letter_id: z.string().min(1),
  title: z.string().min(1),
  tone: z.enum(TONES).optional().default('firm'),
  recommended_counter_pct: z.number().optional(),
  body: z.string().optional().default(''),
})

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [letter] = await db
    .select()
    .from(increase_letters)
    .where(eq(increase_letters.id, body.letter_id))
  if (!letter) return c.json({ error: 'Letter not found' }, 404)
  if (letter.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [packet] = await db
    .insert(pushback_packets)
    .values({
      letter_id: body.letter_id,
      workspace_id: letter.workspace_id,
      user_id: userId,
      title: body.title,
      tone: body.tone,
      recommended_counter_pct: body.recommended_counter_pct ?? null,
      body: body.body,
      status: 'draft',
    })
    .returning()

  return c.json({ packet }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — update packet body/tone/status/title/counter
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  tone: z.enum(TONES).optional(),
  recommended_counter_pct: z.number().nullable().optional(),
  body: z.string().optional(),
  status: z.enum(['draft', 'final', 'sent']).optional(),
  version: z.number().int().optional(),
})

router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(pushback_packets)
    .set({ ...body, updated_at: new Date() })
    .where(eq(pushback_packets.id, id))
    .returning()

  return c.json({ packet: updated })
})

// ---------------------------------------------------------------------------
// POST /:id/sections — add a section
// ---------------------------------------------------------------------------

const sectionSchema = z.object({
  section_type: z.enum(SECTION_TYPES).optional().default('custom'),
  heading: z.string().min(1),
  content: z.string().optional().default(''),
  position: z.number().int().optional(),
})

router.post('/:id/sections', authMiddleware, zValidator('json', sectionSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [packet] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
  if (!packet) return c.json({ error: 'Not found' }, 404)
  if (packet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  let position = body.position
  if (position === undefined) {
    const existingSections = await db
      .select()
      .from(packet_sections)
      .where(eq(packet_sections.packet_id, id))
    position = existingSections.length
  }

  const [section] = await db
    .insert(packet_sections)
    .values({
      packet_id: id,
      user_id: userId,
      section_type: body.section_type,
      heading: body.heading,
      content: body.content,
      position,
    })
    .returning()

  return c.json({ section }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id/sections/:sectionId — update a section
// ---------------------------------------------------------------------------

const sectionUpdateSchema = z.object({
  section_type: z.enum(SECTION_TYPES).optional(),
  heading: z.string().min(1).optional(),
  content: z.string().optional(),
  position: z.number().int().optional(),
})

router.put(
  '/:id/sections/:sectionId',
  authMiddleware,
  zValidator('json', sectionUpdateSchema),
  async (c) => {
    const userId = getUserId(c)
    const id = c.req.param('id')
    const sectionId = c.req.param('sectionId')

    const [packet] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
    if (!packet) return c.json({ error: 'Packet not found' }, 404)
    if (packet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    const [section] = await db
      .select()
      .from(packet_sections)
      .where(and(eq(packet_sections.id, sectionId), eq(packet_sections.packet_id, id)))
    if (!section) return c.json({ error: 'Section not found' }, 404)

    const body = c.req.valid('json')
    const [updated] = await db
      .update(packet_sections)
      .set(body)
      .where(eq(packet_sections.id, sectionId))
      .returning()

    return c.json({ section: updated })
  },
)

// ---------------------------------------------------------------------------
// DELETE /:id/sections/:sectionId — delete a section
// ---------------------------------------------------------------------------

router.delete('/:id/sections/:sectionId', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const sectionId = c.req.param('sectionId')

  const [packet] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
  if (!packet) return c.json({ error: 'Packet not found' }, 404)
  if (packet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [section] = await db
    .select()
    .from(packet_sections)
    .where(and(eq(packet_sections.id, sectionId), eq(packet_sections.packet_id, id)))
  if (!section) return c.json({ error: 'Section not found' }, 404)

  await db.delete(packet_sections).where(eq(packet_sections.id, sectionId))
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete a packet (and its sections)
// ---------------------------------------------------------------------------

router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [packet] = await db.select().from(pushback_packets).where(eq(pushback_packets.id, id))
  if (!packet) return c.json({ error: 'Not found' }, 404)
  if (packet.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(packet_sections).where(eq(packet_sections.packet_id, id))
  await db.delete(pushback_packets).where(eq(pushback_packets.id, id))
  return c.json({ success: true })
})

export default router
