'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Deadline {
  id: string
  workspace_id?: string
  user_id?: string
  letter_id?: string | null
  contract_id?: string | null
  kind: string
  title: string
  due_date: string
  status: string
  created_at?: string
}

interface UpcomingResponse {
  upcoming?: Deadline[]
  overdue?: Deadline[]
}

const STATUS_FILTERS = ['all', 'open', 'done'] as const
const KIND_OPTIONS = ['response', 'rebuttal', 'review', 'renewal', 'escalation', 'other']

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const today = startOfDay(new Date())
  const target = startOfDay(d)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function shortId(id?: string | null) {
  if (!id) return '—'
  return id.slice(0, 8)
}

function isDone(status?: string) {
  return ['done', 'completed', 'closed', 'resolved'].includes((status ?? '').toLowerCase())
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const emptyForm = () => ({
  kind: 'response',
  title: '',
  due_date: new Date().toISOString().slice(0, 10),
  status: 'open',
  letter_id: '',
  contract_id: '',
})

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [upcoming, setUpcoming] = useState<Deadline[]>([])
  const [overdue, setOverdue] = useState<Deadline[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all')
  const [kindFilter, setKindFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Deadline | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [all, up] = await Promise.all([api.getDeadlines(), api.getUpcomingDeadlines()])
      setDeadlines(Array.isArray(all) ? all : [])
      const u = (up ?? {}) as UpcomingResponse
      setUpcoming(Array.isArray(u.upcoming) ? u.upcoming : [])
      setOverdue(Array.isArray(u.overdue) ? u.overdue : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deadlines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c = { total: deadlines.length, open: 0, done: 0, overdue: 0 }
    for (const d of deadlines) {
      if (isDone(d.status)) c.done += 1
      else {
        c.open += 1
        const du = daysUntil(d.due_date)
        if (du !== null && du < 0) c.overdue += 1
      }
    }
    return c
  }, [deadlines])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deadlines
      .filter((d) => {
        if (statusFilter === 'open' && isDone(d.status)) return false
        if (statusFilter === 'done' && !isDone(d.status)) return false
        if (kindFilter !== 'all' && (d.kind ?? '').toLowerCase() !== kindFilter) return false
        if (!q) return true
        return (
          (d.title ?? '').toLowerCase().includes(q) ||
          (d.kind ?? '').toLowerCase().includes(q) ||
          (d.letter_id ?? '').toLowerCase().includes(q) ||
          (d.contract_id ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
  }, [deadlines, statusFilter, kindFilter, search])

  // Calendar cells for the cursor month.
  const calendar = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const first = new Date(year, month, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const byDay = new Map<string, Deadline[]>()
    for (const d of deadlines) {
      const dd = new Date(d.due_date)
      if (Number.isNaN(dd.getTime())) continue
      if (dd.getFullYear() === year && dd.getMonth() === month) {
        const key = String(dd.getDate())
        const arr = byDay.get(key) ?? []
        arr.push(d)
        byDay.set(key, arr)
      }
    }
    const cells: { day: number | null; items: Deadline[] }[] = []
    for (let i = 0; i < startPad; i++) cells.push({ day: null, items: [] })
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, items: byDay.get(String(day)) ?? [] })
    }
    return cells
  }, [deadlines, cursor])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(d: Deadline) {
    setEditing(d)
    setForm({
      kind: d.kind ?? 'response',
      title: d.title ?? '',
      due_date: (d.due_date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      status: isDone(d.status) ? 'done' : 'open',
      letter_id: d.letter_id ?? '',
      contract_id: d.contract_id ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const save = useCallback(async () => {
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!form.due_date) {
      setFormError('Due date is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body: Record<string, unknown> = {
      kind: form.kind,
      title: form.title.trim(),
      due_date: form.due_date,
      status: form.status,
    }
    if (form.letter_id.trim()) body.letter_id = form.letter_id.trim()
    if (form.contract_id.trim()) body.contract_id = form.contract_id.trim()
    try {
      if (editing) await api.updateDeadline(editing.id, body)
      else await api.createDeadline(body)
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save deadline')
    } finally {
      setSaving(false)
    }
  }, [form, editing, load])

  const toggleDone = useCallback(
    async (d: Deadline) => {
      setBusyId(d.id)
      setError(null)
      try {
        await api.updateDeadline(d.id, { status: isDone(d.status) ? 'open' : 'done' })
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update deadline')
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  const remove = useCallback(
    async (d: Deadline) => {
      if (!confirm(`Delete deadline "${d.title}"? This cannot be undone.`)) return
      setBusyId(d.id)
      setError(null)
      try {
        await api.deleteDeadline(d.id)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete deadline')
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  function dueBadge(d: Deadline) {
    if (isDone(d.status)) return <Badge tone="green">done</Badge>
    const du = daysUntil(d.due_date)
    if (du === null) return <Badge tone="neutral">open</Badge>
    if (du < 0) return <Badge tone="red">{`overdue ${Math.abs(du)}d`}</Badge>
    if (du === 0) return <Badge tone="amber">due today</Badge>
    if (du <= 7) return <Badge tone="amber">{`in ${du}d`}</Badge>
    return <Badge tone="blue">{`in ${du}d`}</Badge>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Deadlines</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track response windows, rebuttal cut-offs and contract renewals so no increase slips through unchallenged.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
          <Button onClick={openCreate}>+ New deadline</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="All Deadlines" value={counts.total} />
        <Stat label="Open" value={counts.open} tone="orange" />
        <Stat label="Overdue" value={counts.overdue} tone="red" />
        <Stat label="Done" value={counts.done} tone="green" />
      </div>

      {(overdue.length > 0 || upcoming.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Overdue</h2>
              <Badge tone={overdue.length ? 'red' : 'neutral'}>{overdue.length}</Badge>
            </CardHeader>
            <CardBody className="space-y-2 p-3">
              {overdue.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-500">Nothing overdue. Good.</p>
              ) : (
                overdue.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-200">{d.title}</div>
                      <div className="text-xs text-neutral-500">
                        {d.kind} · due {fmtDate(d.due_date)}
                      </div>
                    </div>
                    {dueBadge(d)}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Upcoming</h2>
              <Badge tone={upcoming.length ? 'orange' : 'neutral'}>{upcoming.length}</Badge>
            </CardHeader>
            <CardBody className="space-y-2 p-3">
              {upcoming.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-500">No deadlines coming up.</p>
              ) : (
                upcoming.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-200">{d.title}</div>
                      <div className="text-xs text-neutral-500">
                        {d.kind} · due {fmtDate(d.due_date)}
                      </div>
                    </div>
                    {dueBadge(d)}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  statusFilter === f
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                {f}
              </button>
            ))}
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="ml-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-xs text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="all">All kinds</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-neutral-700">
              {(['list', 'calendar'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    view === v ? 'bg-red-600 text-white' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deadlines…"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none sm:w-64"
            />
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading deadlines…" />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={load}>
                Try again
              </Button>
            </div>
          ) : view === 'calendar' ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                >
                  ‹ Prev
                </Button>
                <div className="text-sm font-semibold text-white">
                  {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                >
                  Next ›
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-neutral-500">
                {DOW.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendar.map((cell, i) => {
                  const isToday =
                    cell.day !== null &&
                    cursor.getFullYear() === new Date().getFullYear() &&
                    cursor.getMonth() === new Date().getMonth() &&
                    cell.day === new Date().getDate()
                  return (
                    <div
                      key={i}
                      className={`min-h-[84px] rounded-lg border p-1.5 ${
                        cell.day === null
                          ? 'border-transparent'
                          : isToday
                            ? 'border-red-600/70 bg-red-950/20'
                            : 'border-neutral-800 bg-neutral-900/40'
                      }`}
                    >
                      {cell.day !== null && (
                        <>
                          <div className={`text-xs ${isToday ? 'font-bold text-red-300' : 'text-neutral-500'}`}>
                            {cell.day}
                          </div>
                          <div className="mt-1 space-y-1">
                            {cell.items.slice(0, 3).map((d) => (
                              <button
                                key={d.id}
                                onClick={() => openEdit(d)}
                                className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] ${
                                  isDone(d.status)
                                    ? 'bg-emerald-950/50 text-emerald-300'
                                    : (daysUntil(d.due_date) ?? 0) < 0
                                      ? 'bg-red-950/50 text-red-300'
                                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                }`}
                                title={d.title}
                              >
                                {d.title}
                              </button>
                            ))}
                            {cell.items.length > 3 && (
                              <div className="px-1 text-[10px] text-neutral-500">+{cell.items.length - 3} more</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="📅"
                title={deadlines.length === 0 ? 'No deadlines yet' : 'No matching deadlines'}
                description={
                  deadlines.length === 0
                    ? 'Add a deadline to track response windows, rebuttal cut-offs and renewals.'
                    : 'Adjust the filters or search to see more.'
                }
                action={deadlines.length === 0 ? <Button onClick={openCreate}>+ New deadline</Button> : undefined}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Kind</TH>
                  <TH>Due</TH>
                  <TH>When</TH>
                  <TH>Linked</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium text-neutral-200">{d.title}</TD>
                    <TD>
                      <Badge tone="neutral">{d.kind}</Badge>
                    </TD>
                    <TD className="text-xs text-neutral-400">{fmtDate(d.due_date)}</TD>
                    <TD>{dueBadge(d)}</TD>
                    <TD className="font-mono text-xs text-neutral-500">
                      {d.letter_id ? `L:${shortId(d.letter_id)}` : d.contract_id ? `C:${shortId(d.contract_id)}` : '—'}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant={isDone(d.status) ? 'ghost' : 'secondary'}
                          onClick={() => toggleDone(d)}
                          disabled={busyId === d.id}
                        >
                          {busyId === d.id ? <Spinner className="h-4 w-4" /> : isDone(d.status) ? 'Reopen' : 'Mark done'}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(d)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(d)} disabled={busyId === d.id}>
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit deadline' : 'New deadline'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Create deadline'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Respond to Acme price-increase letter"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Kind</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="open">open</option>
              <option value="done">done</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Letter id (optional)
              </label>
              <input
                value={form.letter_id}
                onChange={(e) => setForm({ ...form, letter_id: e.target.value })}
                placeholder="link to a letter"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
                Contract id (optional)
              </label>
              <input
                value={form.contract_id}
                onChange={(e) => setForm({ ...form, contract_id: e.target.value })}
                placeholder="link to a contract"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
