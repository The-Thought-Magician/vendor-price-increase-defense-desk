import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import { plans, workspaces, categories, suppliers } from './db/schema.js'
import { eq } from 'drizzle-orm'

import workspacesRoutes from './routes/workspaces.js'
import categoriesRoutes from './routes/categories.js'
import suppliersRoutes from './routes/suppliers.js'
import contractsRoutes from './routes/contracts.js'
import clausesRoutes from './routes/clauses.js'
import indicesRoutes from './routes/indices.js'
import indexDataRoutes from './routes/indexData.js'
import lettersRoutes from './routes/letters.js'
import clauseChecksRoutes from './routes/clauseChecks.js'
import indexValidationsRoutes from './routes/indexValidations.js'
import creepRoutes from './routes/creep.js'
import packetsRoutes from './routes/packets.js'
import templatesRoutes from './routes/templates.js'
import approvalsRoutes from './routes/approvals.js'
import auditRoutes from './routes/audit.js'
import commentsRoutes from './routes/comments.js'
import baselinesRoutes from './routes/baselines.js'
import scenariosRoutes from './routes/scenarios.js'
import deadlinesRoutes from './routes/deadlines.js'
import playbooksRoutes from './routes/playbooks.js'
import notificationsRoutes from './routes/notifications.js'
import documentsRoutes from './routes/documents.js'
import reportsRoutes from './routes/reports.js'
import dashboardRoutes from './routes/dashboard.js'
import seedRoutes from './routes/seed.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://vendor-price-increase-defense-desk.vercel.app',
]

app.use(
  '*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  }),
)

const api = new Hono()
api.route('/workspaces', workspacesRoutes)
api.route('/categories', categoriesRoutes)
api.route('/suppliers', suppliersRoutes)
api.route('/contracts', contractsRoutes)
api.route('/clauses', clausesRoutes)
api.route('/indices', indicesRoutes)
api.route('/index-data', indexDataRoutes)
api.route('/letters', lettersRoutes)
api.route('/clause-checks', clauseChecksRoutes)
api.route('/index-validations', indexValidationsRoutes)
api.route('/creep', creepRoutes)
api.route('/packets', packetsRoutes)
api.route('/templates', templatesRoutes)
api.route('/approvals', approvalsRoutes)
api.route('/audit', auditRoutes)
api.route('/comments', commentsRoutes)
api.route('/baselines', baselinesRoutes)
api.route('/scenarios', scenariosRoutes)
api.route('/deadlines', deadlinesRoutes)
api.route('/playbooks', playbooksRoutes)
api.route('/notifications', notificationsRoutes)
api.route('/documents', documentsRoutes)
api.route('/reports', reportsRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/seed', seedRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

// ---------------------------------------------------------------------------
// Idempotent seed: plans 'free'/'pro' + a demo workspace with starter rows.
// Count-then-insert so re-runs are safe.
// ---------------------------------------------------------------------------
const DEMO_USER_ID = 'demo-user'

async function seedIfEmpty() {
  // Plans
  const existingPlans = await db.select().from(plans).limit(1)
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      { id: 'free', name: 'Free', price_cents: 0 },
      { id: 'pro', name: 'Pro', price_cents: 4900 },
    ])
    console.log('Seeded plans')
  }

  // Demo workspace + a couple of starter rows for the demo user.
  const existingWs = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.user_id, DEMO_USER_ID))
    .limit(1)
  if (existingWs.length === 0) {
    const [ws] = await db
      .insert(workspaces)
      .values({
        user_id: DEMO_USER_ID,
        name: 'Demo Procurement',
        default_currency: 'USD',
        approval_threshold_cents: 5_000_000,
        contest_over_ask_pct: 1,
      })
      .returning()

    const [cat] = await db
      .insert(categories)
      .values({
        workspace_id: ws.id,
        user_id: DEMO_USER_ID,
        name: 'Logistics',
        description: 'Freight, warehousing, and distribution',
      })
      .returning()

    await db.insert(suppliers).values({
      workspace_id: ws.id,
      user_id: DEMO_USER_ID,
      name: 'Acme Freight Co.',
      category_id: cat.id,
      contact_name: 'Jane Doe',
      contact_email: 'jane@acmefreight.example',
      annual_spend_cents: 120_000_000,
      status: 'active',
    })
    console.log('Seeded demo workspace data')
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately, THEN run migrate() + seed (each idempotent). Never
// await migrate()/seedIfEmpty() before serve() — a cold DB would block the
// port binding and trip a deploy timeout.
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

;(async () => {
  try {
    await migrate()
  } catch (e) {
    console.error('Migration error:', e)
  }
  try {
    await seedIfEmpty()
  } catch (e) {
    console.error('Seed error:', e)
  }
})()

export default app
