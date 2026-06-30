import { CronExpressionParser } from 'cron-parser'

// ---------------------------------------------------------------------------
// Vendor Price-Increase Defense Desk — scheduling/firing engine.
//
// This is a self-contained, deterministic library of pure functions used by
// the route handlers. It models three "schedule kinds":
//
//   - 'cron'   : a standard 5/6-field cron expression (delegated to
//                cron-parser v5 via CronExpressionParser).
//   - 'rate'   : a human "every N minutes|hours|days" rate expression,
//                computed arithmetically.
//   - 'oneoff' : a single ISO instant; fires once if it is in the future.
//
// No external services, no I/O. Everything here is computable from the inputs.
// ---------------------------------------------------------------------------

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface JobInput {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface CollisionWindow {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export interface DstTrap {
  type: 'double_fire' | 'skip' | 'ambiguous'
  atLocal: string
  atUtc: string
}

export interface CoverageGap {
  gapStart: string
  gapEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TZ = 'UTC'
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeTz(tz?: string): string {
  return tz && tz.length > 0 ? tz : DEFAULT_TZ
}

/** Parse "every N <unit>" → { ms } where unit ∈ minutes|hours|days. */
function parseRate(expr: string): { ms: number; n: number; unit: string } | null {
  const m = expr.trim().toLowerCase().match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2]
  let unitMs: number
  if (unit.startsWith('minute')) unitMs = MINUTE_MS
  else if (unit.startsWith('hour')) unitMs = HOUR_MS
  else unitMs = DAY_MS
  return { ms: n * unitMs, n, unit }
}

/** ISO UTC string truncated to whole seconds, with milliseconds zeroed. */
function isoUtc(d: Date): string {
  const t = new Date(d.getTime())
  t.setUTCMilliseconds(0)
  return t.toISOString()
}

/** ISO minute bucket (UTC), e.g. 2025-01-01T13:45:00.000Z. */
function minuteBucketUtc(d: Date): string {
  const t = new Date(d.getTime())
  t.setUTCSeconds(0, 0)
  return t.toISOString()
}

/** Offset (in minutes) of the given instant for a timezone, via Intl. */
function tzOffsetMinutes(instant: Date, tz: string): number {
  // Format the instant in the target tz and in UTC, then diff the wall clocks.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(instant)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  let hour = parseInt(map.hour ?? '0', 10)
  if (hour === 24) hour = 0
  const asUtc = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    hour,
    parseInt(map.minute ?? '0', 10),
    parseInt(map.second ?? '0', 10),
  )
  return Math.round((asUtc - instant.getTime()) / MINUTE_MS)
}

/** Local wall-clock string for an instant in a timezone (ISO-like, no offset). */
function localWallClock(instant: Date, tz: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dtf.formatToParts(instant)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  let hour = map.hour ?? '00'
  if (hour === '24') hour = '00'
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}`
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  const e = (expr ?? '').trim()
  if (!e) return { valid: false, error: 'Expression is empty' }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(e)
      return { valid: true }
    } catch (err: unknown) {
      return { valid: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  if (kind === 'rate') {
    const r = parseRate(e)
    if (!r) return { valid: false, error: 'Rate must look like "every N minutes|hours|days"' }
    return { valid: true }
  }
  if (kind === 'oneoff') {
    const d = new Date(e)
    if (isNaN(d.getTime())) return { valid: false, error: 'One-off must be a valid ISO timestamp' }
    return { valid: true }
  }
  return { valid: false, error: `Unknown schedule kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

export function describeExpression(kind: ScheduleKind, expr: string, timezone?: string): string {
  const tz = safeTz(timezone)
  const e = (expr ?? '').trim()
  const v = validateExpression(kind, e)
  if (!v.valid) return `Invalid schedule: ${v.error}`

  if (kind === 'rate') {
    const r = parseRate(e)!
    return `Runs every ${r.n} ${r.unit} (${tz})`
  }
  if (kind === 'oneoff') {
    return `Runs once at ${isoUtc(new Date(e))} (one-off)`
  }

  // cron
  const fields = e.split(/\s+/)
  const [min, hour, dom, mon, dow] = fields
  const parts: string[] = []

  if (min === '*' && hour === '*') {
    parts.push('every minute')
  } else if (hour === '*' && /^\d+$/.test(min)) {
    parts.push(`at minute ${min} of every hour`)
  } else if (/^\*\/(\d+)$/.test(min) && hour === '*') {
    const step = min.match(/^\*\/(\d+)$/)![1]
    parts.push(`every ${step} minutes`)
  } else if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    parts.push(`daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`)
  } else {
    parts.push(`minute=${min} hour=${hour}`)
  }

  if (dom !== '*' || mon !== '*') parts.push(`day-of-month=${dom} month=${mon}`)
  if (dow !== '*') {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const single = /^\d$/.test(dow) ? names[parseInt(dow, 10) % 7] : dow
    parts.push(`on ${single}`)
  }
  return `${parts.join(', ')} (${tz})`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone: string | undefined,
  fromISO: string,
  count: number,
): string[] {
  const tz = safeTz(timezone)
  const e = (expr ?? '').trim()
  const n = Math.max(0, Math.min(count ?? 0, 10_000))
  if (n === 0) return []
  const from = new Date(fromISO)
  if (isNaN(from.getTime())) return []

  if (kind === 'cron') {
    try {
      const interval = CronExpressionParser.parse(e, { tz, currentDate: from })
      const out: string[] = []
      for (let i = 0; i < n; i++) {
        const next = interval.next()
        out.push(isoUtc(next.toDate()))
      }
      return out
    } catch {
      return []
    }
  }

  if (kind === 'rate') {
    const r = parseRate(e)
    if (!r) return []
    const out: string[] = []
    let t = from.getTime() + r.ms
    for (let i = 0; i < n; i++) {
      out.push(isoUtc(new Date(t)))
      t += r.ms
    }
    return out
  }

  if (kind === 'oneoff') {
    const d = new Date(e)
    if (isNaN(d.getTime())) return []
    if (d.getTime() > from.getTime()) return [isoUtc(d)]
    return []
  }

  return []
}

// ---------------------------------------------------------------------------
// loadHeatmap — firings per hour bucket across the horizon.
// ---------------------------------------------------------------------------

export function loadHeatmap(
  jobs: JobInput[],
  opts: { horizonDays: number },
): HeatmapBucket[] {
  const horizonDays = Math.max(1, opts?.horizonDays ?? 7)
  const from = new Date()
  const horizonEnd = from.getTime() + horizonDays * DAY_MS
  const counts = new Map<string, number>()

  for (const job of jobs) {
    const firings = nextFirings(
      job.kind,
      job.expr,
      job.timezone,
      from.toISOString(),
      // generous cap; we filter by horizon below
      Math.min(5000, horizonDays * 24 * 6),
    )
    for (const f of firings) {
      const t = new Date(f).getTime()
      if (t > horizonEnd) break
      const d = new Date(t)
      d.setUTCMinutes(0, 0, 0)
      const bucket = d.toISOString()
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

// ---------------------------------------------------------------------------
// computeCollisions — minutes where concurrency >= threshold or >= 2 jobs
// share a resourceId.
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: JobInput[],
  opts: { horizonDays: number; threshold: number },
): CollisionWindow[] {
  const horizonDays = Math.max(1, opts?.horizonDays ?? 7)
  const threshold = Math.max(2, opts?.threshold ?? 2)
  const from = new Date()
  const horizonEnd = from.getTime() + horizonDays * DAY_MS

  // minuteBucket -> { jobIds:Set, resources:Map<resourceId, count> }
  const buckets = new Map<string, { jobIds: Set<string>; resources: Map<string, Set<string>> }>()

  for (const job of jobs) {
    const firings = nextFirings(
      job.kind,
      job.expr,
      job.timezone,
      from.toISOString(),
      Math.min(5000, horizonDays * 24 * 60),
    )
    for (const f of firings) {
      const t = new Date(f).getTime()
      if (t > horizonEnd) break
      const key = minuteBucketUtc(new Date(t))
      let entry = buckets.get(key)
      if (!entry) {
        entry = { jobIds: new Set(), resources: new Map() }
        buckets.set(key, entry)
      }
      entry.jobIds.add(job.id)
      if (job.resourceId) {
        let set = entry.resources.get(job.resourceId)
        if (!set) {
          set = new Set()
          entry.resources.set(job.resourceId, set)
        }
        set.add(job.id)
      }
    }
  }

  const out: CollisionWindow[] = []
  for (const [key, entry] of buckets) {
    const concurrency = entry.jobIds.size
    // resource collision: any resource hit by >=2 distinct jobs
    let resourceCollision: string | undefined
    for (const [resId, set] of entry.resources) {
      if (set.size >= 2) {
        resourceCollision = resId
        break
      }
    }
    const concurrencyHit = concurrency >= threshold
    if (!concurrencyHit && !resourceCollision) continue

    const start = new Date(key)
    const end = new Date(start.getTime() + MINUTE_MS)
    let severity: CollisionWindow['severity'] = 'low'
    if (resourceCollision) severity = 'high'
    else if (concurrency >= threshold * 2) severity = 'high'
    else if (concurrency >= threshold) severity = 'medium'

    out.push({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      jobIds: [...entry.jobIds].sort(),
      severity,
      resourceId: resourceCollision,
    })
  }

  return out.sort((a, b) => a.windowStart.localeCompare(b.windowStart))
}

// ---------------------------------------------------------------------------
// dstTraps — detect double-fire / skip / ambiguous instants caused by a
// timezone offset change within the window.
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string | undefined,
  fromISO: string,
  days: number,
): DstTrap[] {
  const tz = safeTz(timezone)
  if (tz === 'UTC') return [] // UTC never has DST transitions
  const from = new Date(fromISO)
  if (isNaN(from.getTime())) return []
  const d = Math.max(1, days ?? 7)

  // 1) Find offset transitions by scanning hour-by-hour across the window.
  const transitions: { at: Date; before: number; after: number }[] = []
  let prevOffset = tzOffsetMinutes(from, tz)
  const end = from.getTime() + d * DAY_MS
  for (let t = from.getTime() + HOUR_MS; t <= end; t += HOUR_MS) {
    const cur = new Date(t)
    const off = tzOffsetMinutes(cur, tz)
    if (off !== prevOffset) {
      transitions.push({ at: cur, before: prevOffset, after: off })
      prevOffset = off
    }
  }
  if (transitions.length === 0) return []

  // 2) Gather firings across the window and flag those near a transition.
  const firings = nextFirings(kind, expr, tz, from.toISOString(), Math.min(5000, d * 24 * 60))
    .map((f) => new Date(f))
    .filter((f) => f.getTime() <= end)

  const traps: DstTrap[] = []
  const WINDOW_MS = HOUR_MS // consider firings within ±1h of the transition

  for (const tr of transitions) {
    const springForward = tr.after > tr.before // gap (skip)
    const fallBack = tr.after < tr.before // overlap (ambiguous / double)
    for (const f of firings) {
      const delta = Math.abs(f.getTime() - tr.at.getTime())
      if (delta > WINDOW_MS) continue
      if (springForward) {
        traps.push({
          type: 'skip',
          atLocal: localWallClock(f, tz),
          atUtc: f.toISOString(),
        })
      } else if (fallBack) {
        // a wall-clock time occurs twice → ambiguous, and a wall-clock based
        // schedule can double-fire.
        traps.push({
          type: 'ambiguous',
          atLocal: localWallClock(f, tz),
          atUtc: f.toISOString(),
        })
        traps.push({
          type: 'double_fire',
          atLocal: localWallClock(f, tz),
          atUtc: f.toISOString(),
        })
      }
    }
  }

  // de-dup
  const seen = new Set<string>()
  return traps.filter((t) => {
    const k = `${t.type}|${t.atUtc}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ---------------------------------------------------------------------------
// coverageGaps — intervals (windows) that no job firing falls into.
//
// `windows` describe required-coverage intervals as { start, end } ISO pairs.
// We flag any sub-interval of a window that contains no job firing.
// ---------------------------------------------------------------------------

export function coverageGaps(
  windows: Array<{ start: string; end: string }>,
  jobs: JobInput[],
  opts: { horizonDays: number },
): CoverageGap[] {
  const horizonDays = Math.max(1, opts?.horizonDays ?? 7)
  const now = new Date()
  const horizonEnd = now.getTime() + horizonDays * DAY_MS

  // Collect all firing instants within the horizon, sorted.
  const firings: number[] = []
  for (const job of jobs) {
    const fs = nextFirings(
      job.kind,
      job.expr,
      job.timezone,
      now.toISOString(),
      Math.min(5000, horizonDays * 24 * 60),
    )
    for (const f of fs) {
      const t = new Date(f).getTime()
      if (t <= horizonEnd) firings.push(t)
    }
  }
  firings.sort((a, b) => a - b)

  const gaps: CoverageGap[] = []
  for (const w of windows) {
    const ws = new Date(w.start).getTime()
    const we = new Date(w.end).getTime()
    if (isNaN(ws) || isNaN(we) || we <= ws) continue
    const inside = firings.filter((t) => t >= ws && t <= we)
    if (inside.length === 0) {
      gaps.push({
        gapStart: new Date(ws).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - ws) / MINUTE_MS),
      })
      continue
    }
    // gap before first firing
    if (inside[0] > ws) {
      gaps.push({
        gapStart: new Date(ws).toISOString(),
        gapEnd: new Date(inside[0]).toISOString(),
        durationMinutes: Math.round((inside[0] - ws) / MINUTE_MS),
      })
    }
    // gap after last firing
    const last = inside[inside.length - 1]
    if (last < we) {
      gaps.push({
        gapStart: new Date(last).toISOString(),
        gapEnd: new Date(we).toISOString(),
        durationMinutes: Math.round((we - last) / MINUTE_MS),
      })
    }
  }
  return gaps.sort((a, b) => a.gapStart.localeCompare(b.gapStart))
}

// ---------------------------------------------------------------------------
// autoSpread — for jobs colliding on a minute bucket, suggest staggered
// cron expressions to reduce concurrency below the threshold.
// ---------------------------------------------------------------------------

export function autoSpread(
  jobs: JobInput[],
  opts: { threshold: number },
): SpreadSuggestion[] {
  const threshold = Math.max(2, opts?.threshold ?? 2)
  const collisions = computeCollisions(jobs, { horizonDays: 1, threshold })
  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const suggestions: SpreadSuggestion[] = []
  const handled = new Set<string>()

  for (const win of collisions) {
    // keep the first job in place, stagger the rest by +offset minutes.
    const colliding = win.jobIds.filter((id) => !handled.has(id))
    let offset = 0
    for (let i = 0; i < colliding.length; i++) {
      const id = colliding[i]
      const job = jobById.get(id)
      if (!job) continue
      if (i === 0) {
        handled.add(id)
        continue
      }
      offset += Math.max(1, Math.floor(60 / Math.max(1, colliding.length)))
      let suggested = job.expr
      if (job.kind === 'cron') {
        const fields = job.expr.trim().split(/\s+/)
        const baseMin = /^\d+$/.test(fields[0]) ? parseInt(fields[0], 10) : 0
        fields[0] = String((baseMin + offset) % 60)
        suggested = fields.join(' ')
      } else if (job.kind === 'rate') {
        suggested = job.expr // rate jobs phase-shift; expr unchanged, note offset
      }
      suggestions.push({
        jobId: id,
        suggestedExpr: suggested,
        reason: `Collides with ${colliding.length - 1} other job(s) at ${win.windowStart}${
          win.resourceId ? ` on resource ${win.resourceId}` : ''
        }; stagger by +${offset} minute(s).`,
      })
      handled.add(id)
    }
  }
  return suggestions
}
