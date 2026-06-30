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

interface ApprovalStep {
  id: string
  approval_id: string
  step_order: number
  role: string
  status: string
  decided_by?: string | null
  decided_at?: string | null
  note?: string | null
  created_at?: string
}

interface Approval {
  id: string
  workspace_id?: string
  letter_id: string
  status: string
  decision_note?: string | null
  created_at?: string
  updated_at?: string
  steps?: ApprovalStep[]
}

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected'] as const

function fmtDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function shortId(id?: string) {
  if (!id) return '—'
  return id.slice(0, 8)
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<Approval | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [noteByStep, setNoteByStep] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getApprovals()
      setApprovals(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = useCallback(async (approval: Approval) => {
    setSelected(approval)
    setDetailError(null)
    setNoteByStep({})
    setDetailLoading(true)
    try {
      const data = await api.getApproval(approval.id)
      const merged: Approval = {
        ...approval,
        ...(data?.approval ?? {}),
        steps: data?.steps ?? approval.steps ?? [],
      }
      setSelected(merged)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Failed to load approval detail')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const refreshDetail = useCallback(async (id: string) => {
    try {
      const data = await api.getApproval(id)
      setSelected((prev) =>
        prev && prev.id === id
          ? { ...prev, ...(data?.approval ?? {}), steps: data?.steps ?? prev.steps ?? [] }
          : prev,
      )
    } catch {
      /* keep existing detail */
    }
  }, [])

  const decide = useCallback(
    async (step: ApprovalStep, status: 'approved' | 'rejected') => {
      if (!selected) return
      setActing(step.id)
      setDetailError(null)
      try {
        const data = await api.decideApproval(selected.id, {
          step_id: step.id,
          status,
          note: noteByStep[step.id] ?? '',
        })
        if (data?.approval || data?.steps) {
          setSelected((prev) =>
            prev
              ? { ...prev, ...(data.approval ?? {}), steps: data.steps ?? prev.steps ?? [] }
              : prev,
          )
        } else {
          await refreshDetail(selected.id)
        }
        await load()
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : 'Failed to record decision')
      } finally {
        setActing(null)
      }
    },
    [selected, noteByStep, refreshDetail, load],
  )

  const removeApproval = useCallback(
    async (approval: Approval) => {
      if (!confirm('Delete this approval and all of its steps? This cannot be undone.')) return
      try {
        await api.deleteApproval(approval.id)
        if (selected?.id === approval.id) setSelected(null)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete approval')
      }
    },
    [selected, load],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return approvals.filter((a) => {
      if (statusFilter !== 'all' && (a.status ?? '').toLowerCase() !== statusFilter) return false
      if (!q) return true
      return (
        a.id.toLowerCase().includes(q) ||
        (a.letter_id ?? '').toLowerCase().includes(q) ||
        (a.decision_note ?? '').toLowerCase().includes(q)
      )
    })
  }, [approvals, statusFilter, search])

  const counts = useMemo(() => {
    const c = { total: approvals.length, pending: 0, approved: 0, rejected: 0 }
    for (const a of approvals) {
      const s = (a.status ?? '').toLowerCase()
      if (s === 'pending') c.pending += 1
      else if (s === 'approved') c.approved += 1
      else if (s === 'rejected') c.rejected += 1
    }
    return c
  }, [approvals])

  function stepProgress(a: Approval) {
    const steps = a.steps ?? []
    if (!steps.length) return null
    const done = steps.filter((s) => (s.status ?? '').toLowerCase() !== 'pending').length
    return { done, total: steps.length }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Approval Queue</h1>
          <p className="mt-1 text-sm text-slate-500">
            Multi-step sign-off on contested price increases before a counter goes out.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="All Approvals" value={counts.total} />
        <Stat label="Pending" value={counts.pending} tone="orange" />
        <Stat label="Approved" value={counts.approved} tone="green" />
        <Stat label="Rejected" value={counts.rejected} tone="red" />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  statusFilter === f
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by id, letter or note…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading approvals…" />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={load}>
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="🗳️"
                title={approvals.length === 0 ? 'No approvals yet' : 'No matching approvals'}
                description={
                  approvals.length === 0
                    ? 'Approvals are created from a letter once it is contested and routed for sign-off.'
                    : 'Adjust the status filter or search to see more.'
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Approval</TH>
                  <TH>Letter</TH>
                  <TH>Status</TH>
                  <TH>Progress</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((a) => {
                  const prog = stepProgress(a)
                  return (
                    <TR key={a.id}>
                      <TD className="font-mono text-xs text-slate-400">{shortId(a.id)}</TD>
                      <TD className="font-mono text-xs text-slate-400">{shortId(a.letter_id)}</TD>
                      <TD>
                        <Badge tone={verdictTone(a.status)}>{a.status ?? 'unknown'}</Badge>
                      </TD>
                      <TD>
                        {prog ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-orange-500"
                                style={{ width: `${(prog.done / prog.total) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">
                              {prog.done}/{prog.total}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </TD>
                      <TD className="text-xs text-slate-500">{fmtDate(a.updated_at ?? a.created_at)}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="secondary" onClick={() => openDetail(a)}>
                            Review
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => removeApproval(a)}>
                            Delete
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Approval ${shortId(selected.id)}` : 'Approval'}
      >
        {!selected ? null : detailLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            {detailError && (
              <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {detailError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
                <div className="mt-1">
                  <Badge tone={verdictTone(selected.status)}>{selected.status ?? 'unknown'}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Letter</div>
                <div className="mt-1 font-mono text-xs text-slate-300">{shortId(selected.letter_id)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Created</div>
                <div className="mt-1 text-slate-300">{fmtDate(selected.created_at)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Updated</div>
                <div className="mt-1 text-slate-300">{fmtDate(selected.updated_at ?? selected.created_at)}</div>
              </div>
            </div>

            {selected.decision_note && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                <span className="text-xs uppercase tracking-wide text-slate-500">Decision note: </span>
                {selected.decision_note}
              </div>
            )}

            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-200">Steps</h3>
              {(selected.steps ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No steps recorded for this approval.</p>
              ) : (
                <ol className="space-y-3">
                  {[...(selected.steps ?? [])]
                    .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))
                    .map((step) => {
                      const decided = (step.status ?? '').toLowerCase() !== 'pending'
                      return (
                        <li
                          key={step.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                                {step.step_order}
                              </span>
                              <span className="text-sm font-medium text-slate-200">
                                {step.role || 'Reviewer'}
                              </span>
                            </div>
                            <Badge tone={verdictTone(step.status)}>{step.status ?? 'pending'}</Badge>
                          </div>

                          {decided ? (
                            <div className="mt-2 space-y-1 text-xs text-slate-500">
                              {step.decided_by && <div>Decided by {step.decided_by}</div>}
                              {step.decided_at && <div>{fmtDate(step.decided_at)}</div>}
                              {step.note && <div className="text-slate-400">“{step.note}”</div>}
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={noteByStep[step.id] ?? ''}
                                onChange={(e) =>
                                  setNoteByStep((prev) => ({ ...prev, [step.id]: e.target.value }))
                                }
                                placeholder="Optional decision note…"
                                rows={2}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => decide(step, 'approved')}
                                  disabled={acting === step.id}
                                >
                                  {acting === step.id ? <Spinner className="h-4 w-4" /> : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => decide(step, 'rejected')}
                                  disabled={acting === step.id}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
