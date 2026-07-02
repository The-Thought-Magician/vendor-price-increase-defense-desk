'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Letter {
  id: string
  title?: string
  supplier_id?: string
  contract_id?: string
  proposed_pct?: number
  effective_date?: string
  received_date?: string
  status?: string
  defensibility_score?: number
  aggregate_verdict?: string
  annual_impact_cents?: number
  created_at?: string
}

interface Supplier {
  id: string
  name?: string
}

const STATUSES = [
  'new',
  'analyzing',
  'analyzed',
  'packet-ready',
  'sent',
  'negotiating',
  'accepted',
  'contested',
  'resolved',
]

function fmtMoney(cents?: number): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPct(p?: number): string {
  if (p == null) return '—'
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`
}

function scoreTone(score?: number): 'green' | 'amber' | 'red' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 70) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

export default function LettersPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [letters, setLetters] = useState<Letter[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = {}
      if (statusFilter) params.status = statusFilter
      if (supplierFilter) params.supplier_id = supplierFilter
      const [ls, sups] = await Promise.all([
        api.getLetters(params),
        api.getSuppliers(),
      ])
      setLetters(Array.isArray(ls) ? ls : [])
      setSuppliers(Array.isArray(sups) ? sups : [])
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load letters')
    } finally {
      setLoading(false)
    }
  }

  // Reload from server when server-side filters change.
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, supplierFilter])

  const supplierName = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name || s.id))
    return m
  }, [suppliers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return letters
    return letters.filter((l) => {
      const name = (l.supplier_id && supplierName.get(l.supplier_id)) || ''
      return (
        (l.title || '').toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      )
    })
  }, [letters, search, supplierName])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set()
      return new Set(filtered.map((l) => l.id))
    })
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} letter(s)? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await Promise.all([...selected].map((id) => api.deleteLetter(id)))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed')
      setBusy(false)
    }
  }

  async function bulkStatus(status: string) {
    if (selected.size === 0 || !status) return
    setBusy(true)
    setError(null)
    try {
      await Promise.all([...selected].map((id) => api.setLetterStatus(id, status)))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk status update failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this letter?')) return
    setBusy(true)
    setError(null)
    try {
      await api.deleteLetter(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setBusy(false)
    }
  }

  const allChecked = filtered.length > 0 && selected.size === filtered.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Increase Letters</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Every supplier ask, scored for defensibility.
          </p>
        </div>
        <Link href="/dashboard/letters/new">
          <Button>+ New Letter</Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Search
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or supplier..."
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
              Supplier
            </label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.id}
                </option>
              ))}
            </select>
          </div>
          {(statusFilter || supplierFilter || search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatusFilter('')
                setSupplierFilter('')
                setSearch('')
              }}
            >
              Clear
            </Button>
          )}
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3">
          <span className="text-sm text-red-200">{selected.size} selected</span>
          <select
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value
              e.target.value = ''
              bulkStatus(v)
            }}
            defaultValue=""
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
          >
            <option value="" disabled>
              Set status…
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button variant="danger" size="sm" disabled={busy} onClick={bulkDelete}>
            Delete selected
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading letters..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📨"
          title={letters.length === 0 ? 'No letters yet' : 'No matching letters'}
          description={
            letters.length === 0
              ? 'Log a supplier price-increase letter to start building your defense.'
              : 'Try clearing filters or adjusting your search.'
          }
          action={
            letters.length === 0 ? (
              <Link href="/dashboard/letters/new">
                <Button>+ New Letter</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 accent-red-600"
                  aria-label="Select all"
                />
              </TH>
              <TH>Letter</TH>
              <TH>Supplier</TH>
              <TH>Proposed</TH>
              <TH>Annual Impact</TH>
              <TH>Defensibility</TH>
              <TH>Verdict</TH>
              <TH>Status</TH>
              <TH>Effective</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((l) => (
              <TR key={l.id}>
                <TD>
                  <input
                    type="checkbox"
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l.id)}
                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-950 accent-red-600"
                    aria-label={`Select ${l.title || l.id}`}
                  />
                </TD>
                <TD>
                  <Link
                    href={`/dashboard/letters/${l.id}`}
                    className="font-medium text-neutral-100 hover:text-red-400"
                  >
                    {l.title || 'Untitled letter'}
                  </Link>
                  <div className="text-xs text-neutral-500">Received {fmtDate(l.received_date)}</div>
                </TD>
                <TD>{(l.supplier_id && supplierName.get(l.supplier_id)) || '—'}</TD>
                <TD className="tabular-nums">{fmtPct(l.proposed_pct)}</TD>
                <TD className="tabular-nums">{fmtMoney(l.annual_impact_cents)}</TD>
                <TD>
                  {l.defensibility_score != null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className={`h-full rounded-full ${
                            scoreTone(l.defensibility_score) === 'green'
                              ? 'bg-emerald-500'
                              : scoreTone(l.defensibility_score) === 'amber'
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, l.defensibility_score))}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-neutral-400">
                        {Math.round(l.defensibility_score)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-600">not run</span>
                  )}
                </TD>
                <TD>
                  {l.aggregate_verdict ? (
                    <Badge tone={verdictTone(l.aggregate_verdict)}>{l.aggregate_verdict}</Badge>
                  ) : (
                    '—'
                  )}
                </TD>
                <TD>
                  <Badge tone={verdictTone(l.status)}>{l.status || 'new'}</Badge>
                </TD>
                <TD className="text-xs text-neutral-400">{fmtDate(l.effective_date)}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/letters/${l.id}`}>
                      <Button variant="ghost" size="sm">Open</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      className="text-red-400 hover:bg-red-950/40 hover:text-red-300"
                      onClick={() => deleteOne(l.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
