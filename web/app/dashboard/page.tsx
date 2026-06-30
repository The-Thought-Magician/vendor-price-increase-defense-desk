'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Dashboard {
  open_letters?: number
  breaches_detected?: number
  savings_ytd_cents?: number
  upcoming_deadlines?: number
  recent_activity?: ActivityRow[]
  counts?: Record<string, number>
}

interface ActivityRow {
  id: string
  action?: string
  entity_type?: string
  summary?: string
  created_at?: string
}

interface Deadline {
  id: string
  kind?: string
  title?: string
  due_date?: string
  status?: string
}

function fmtMoney(cents?: number): string {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(s?: string): number | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function DashboardHome() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Dashboard | null>(null)
  const [upcoming, setUpcoming] = useState<Deadline[]>([])
  const [overdue, setOverdue] = useState<Deadline[]>([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [dash, deadlines] = await Promise.all([api.getDashboard(), api.getUpcomingDeadlines()])
      setData(dash ?? {})
      setUpcoming(Array.isArray(deadlines?.upcoming) ? deadlines.upcoming : [])
      setOverdue(Array.isArray(deadlines?.overdue) ? deadlines.overdue : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <PageSpinner label="Loading defense desk..." />

  if (error) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <Button variant="secondary" onClick={load}>Retry</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const d = data ?? {}
  const counts = d.counts ?? {}
  const activity = d.recent_activity ?? []
  const overdueCount = overdue.length

  return (
    <div className="space-y-6">
      <Header />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Open Letters"
          value={d.open_letters ?? 0}
          hint="Awaiting analysis or response"
          tone="orange"
        />
        <Stat
          label="Breaches Detected"
          value={d.breaches_detected ?? 0}
          hint="Cap / index / creep violations"
          tone={d.breaches_detected ? 'red' : 'default'}
        />
        <Stat
          label="Savings YTD"
          value={fmtMoney(d.savings_ytd_cents)}
          hint="Avoided cost vs. supplier ask"
          tone="green"
        />
        <Stat
          label="Upcoming Deadlines"
          value={d.upcoming_deadlines ?? upcoming.length}
          hint={overdueCount ? `${overdueCount} overdue` : 'Response & notice windows'}
          tone={overdueCount ? 'red' : 'default'}
        />
      </div>

      {/* Secondary counts */}
      {Object.keys(counts).length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Portfolio Snapshot</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{k.replace(/_/g, ' ')}</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-200">{v}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Upcoming Deadlines</h2>
              <Link href="/dashboard/deadlines">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {overdue.length === 0 && upcoming.length === 0 ? (
              <EmptyState
                icon="🗓️"
                title="No deadlines tracked"
                description="Response and notice windows for active letters will appear here."
              />
            ) : (
              <>
                {overdue.map((dl) => (
                  <DeadlineRow key={dl.id} dl={dl} overdue />
                ))}
                {upcoming.map((dl) => (
                  <DeadlineRow key={dl.id} dl={dl} />
                ))}
              </>
            )}
          </CardBody>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Recent Activity</h2>
              <Link href="/dashboard/audit">
                <Button variant="ghost" size="sm">Audit trail</Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {activity.length === 0 ? (
              <EmptyState
                icon="📡"
                title="No activity yet"
                description="Letter analysis, packet generation, and approvals will show up here."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-800 pl-5">
                {activity.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full bg-orange-500 ring-4 ring-slate-900" />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-200">{a.summary || a.action || 'Event'}</p>
                        <div className="mt-1 flex items-center gap-2">
                          {a.entity_type && <Badge tone="neutral">{a.entity_type}</Badge>}
                          {a.action && <span className="text-xs text-slate-500">{a.action}</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">{fmtDate(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">Defense Desk</h1>
        <p className="mt-1 text-sm text-slate-400">
          Catch unjustified price increases before they sign.
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/dashboard/letters/new">
          <Button>+ New Letter</Button>
        </Link>
        <Link href="/dashboard/letters">
          <Button variant="secondary">All Letters</Button>
        </Link>
      </div>
    </div>
  )
}

function DeadlineRow({ dl, overdue }: { dl: Deadline; overdue?: boolean }) {
  const days = daysUntil(dl.due_date)
  let hint = ''
  let tone: 'red' | 'amber' | 'neutral' = 'neutral'
  if (overdue) {
    hint = days != null ? `${Math.abs(days)}d overdue` : 'Overdue'
    tone = 'red'
  } else if (days != null) {
    hint = days <= 0 ? 'Due today' : `in ${days}d`
    tone = days <= 3 ? 'amber' : 'neutral'
  }
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-200">{dl.title || dl.kind || 'Deadline'}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {dl.kind && <span className="mr-2 uppercase tracking-wide">{dl.kind}</span>}
          {fmtDate(dl.due_date)}
        </p>
      </div>
      <Badge tone={tone}>{hint || dl.status || '—'}</Badge>
    </div>
  )
}
