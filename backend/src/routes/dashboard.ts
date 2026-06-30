import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  increase_letters,
  deadlines,
  activity_log,
  suppliers,
  contracts,
  pushback_packets,
  clause_checks,
  cumulative_creep_records,
  counter_scenarios,
} from '../db/schema.js'
import { desc } from 'drizzle-orm'

const router = new Hono()

// Statuses considered "open" / in-flight (not yet resolved).
const OPEN_STATUSES = new Set(['draft', 'logged', 'under_review', 'packet_ready', 'sent', 'contested'])

// ---------------------------------------------------------------------------
// GET / — home dashboard aggregates
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const now = new Date()
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))

  const [letters, deadlineRows, activityRows, supplierRows, contractRows, packetRows, checkRows, creepRows, scenarioRows] =
    await Promise.all([
      db.select().from(increase_letters),
      db.select().from(deadlines),
      db.select().from(activity_log).orderBy(desc(activity_log.created_at)).limit(10),
      db.select().from(suppliers),
      db.select().from(contracts),
      db.select().from(pushback_packets),
      db.select().from(clause_checks),
      db.select().from(cumulative_creep_records),
      db.select().from(counter_scenarios),
    ])

  // Open letters.
  const openLetters = letters.filter((l) => OPEN_STATUSES.has(l.status))

  // Breaches: letters with a breach aggregate verdict, plus breach-level clause
  // checks and breached cumulative-creep records.
  const breachLetters = letters.filter((l) => l.aggregate_verdict === 'breach').length
  const breachChecks = checkRows.filter((ck) => ck.verdict === 'breach').length
  const breachedCreep = creepRows.filter((r) => r.breached).length
  const breachesDetected = breachLetters + breachChecks + breachedCreep

  // Savings YTD: avoided cents from recommended scenarios on letters received this year.
  const recommendedByLetter = new Map<string, { applied_pct: number | null; annual_impact_cents: number }>()
  for (const s of scenarioRows) {
    if (s.is_recommended && !recommendedByLetter.has(s.letter_id)) {
      recommendedByLetter.set(s.letter_id, {
        applied_pct: s.applied_pct,
        annual_impact_cents: s.annual_impact_cents,
      })
    }
  }
  let savingsYtd = 0
  for (const letter of letters) {
    const dateSrc = (letter.received_date ?? letter.created_at) as unknown as string | Date | null
    if (!dateSrc) continue
    const d = new Date(dateSrc)
    if (d < startOfYear) continue
    const proposedImpact = letter.annual_impact_cents ?? 0
    const proposedPct = letter.proposed_pct ?? 0
    const rec = recommendedByLetter.get(letter.id)
    let acceptedImpact: number
    if (rec && rec.annual_impact_cents) {
      acceptedImpact = rec.annual_impact_cents
    } else if (rec && rec.applied_pct != null && proposedPct > 0) {
      acceptedImpact = Math.round(proposedImpact * (rec.applied_pct / proposedPct))
    } else if (letter.status === 'accepted') {
      acceptedImpact = proposedImpact
    } else {
      acceptedImpact = proposedImpact
    }
    savingsYtd += Math.max(0, proposedImpact - acceptedImpact)
  }

  // Upcoming deadlines: open deadlines due in the future, soonest first.
  const upcomingDeadlines = deadlineRows
    .filter((d) => d.status === 'open' && new Date(d.due_date as unknown as string | Date) >= now)
    .sort(
      (a, b) =>
        new Date(a.due_date as unknown as string | Date).getTime() -
        new Date(b.due_date as unknown as string | Date).getTime(),
    )
    .slice(0, 10)

  const overdueDeadlines = deadlineRows.filter(
    (d) => d.status !== 'done' && new Date(d.due_date as unknown as string | Date) < now,
  ).length

  // Counts by letter status.
  const statusCounts: Record<string, number> = {}
  for (const l of letters) statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1

  return c.json({
    open_letters: openLetters.length,
    breaches_detected: breachesDetected,
    savings_ytd_cents: savingsYtd,
    upcoming_deadlines: upcomingDeadlines,
    recent_activity: activityRows,
    counts: {
      letters: letters.length,
      open_letters: openLetters.length,
      suppliers: supplierRows.length,
      contracts: contractRows.length,
      packets: packetRows.length,
      deadlines_open: deadlineRows.filter((d) => d.status === 'open').length,
      deadlines_overdue: overdueDeadlines,
      breaches: breachesDetected,
      by_status: statusCounts,
    },
  })
})

export default router
