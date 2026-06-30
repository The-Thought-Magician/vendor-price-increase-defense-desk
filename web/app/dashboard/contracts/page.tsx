'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Contract {
  id: string
  supplier_id: string | null
  name: string
  reference_number: string | null
  currency: string | null
  effective_date: string | null
  term_end_date: string | null
  version: number | null
  governing_entity: string | null
  status: string | null
  notes: string | null
  created_at: string
}

interface Supplier {
  id: string
  name: string
}

const STATUSES = ['active', 'expiring', 'expired', 'draft', 'terminated']

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function daysUntil(d?: string | null): number | null {
  if (!d) return null
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  return Math.round((dt.getTime() - Date.now()) / 86_400_000)
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    supplier_id: '',
    reference_number: '',
    currency: 'USD',
    effective_date: '',
    term_end_date: '',
    governing_entity: '',
    status: 'active',
    notes: '',
  })

  const supplierName = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [c, s] = await Promise.all([api.getContracts(), api.getSuppliers()])
      setContracts(Array.isArray(c) ? c : [])
      setSuppliers(Array.isArray(s) ? s : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contracts.filter((c) => {
      if (statusFilter && (c.status ?? '') !== statusFilter) return false
      if (supplierFilter && c.supplier_id !== supplierFilter) return false
      if (q) {
        const hay = `${c.name} ${c.reference_number ?? ''} ${c.governing_entity ?? ''} ${
          c.supplier_id ? supplierName.get(c.supplier_id) ?? '' : ''
        }`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [contracts, search, statusFilter, supplierFilter, supplierName])

  const stats = useMemo(() => {
    const total = contracts.length
    const active = contracts.filter((c) => (c.status ?? '') === 'active').length
    const expiringSoon = contracts.filter((c) => {
      const d = daysUntil(c.term_end_date)
      return d !== null && d >= 0 && d <= 90
    }).length
    const expired = contracts.filter((c) => {
      const d = daysUntil(c.term_end_date)
      return d !== null && d < 0
    }).length
    return { total, active, expiringSoon, expired }
  }, [contracts])

  function resetForm() {
    setForm({
      name: '',
      supplier_id: '',
      reference_number: '',
      currency: 'USD',
      effective_date: '',
      term_end_date: '',
      governing_entity: '',
      status: 'active',
      notes: '',
    })
    setFormError(null)
  }

  async function submitCreate() {
    if (!form.name.trim()) {
      setFormError('Contract name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        currency: form.currency || 'USD',
        status: form.status,
      }
      if (form.supplier_id) body.supplier_id = form.supplier_id
      if (form.reference_number.trim()) body.reference_number = form.reference_number.trim()
      if (form.effective_date) body.effective_date = form.effective_date
      if (form.term_end_date) body.term_end_date = form.term_end_date
      if (form.governing_entity.trim()) body.governing_entity = form.governing_entity.trim()
      if (form.notes.trim()) body.notes = form.notes.trim()
      await api.createContract(body)
      setCreateOpen(false)
      resetForm()
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create contract')
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Contract) {
    if (!window.confirm(`Delete contract "${c.name}"? This cannot be undone.`)) return
    try {
      await api.deleteContract(c.id)
      setContracts((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete contract')
    }
  }

  const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none'
  const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contracts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Master agreements, escalation caps, and governing terms behind every price-increase fight.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true) }}>+ New Contract</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Contracts" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="green" />
        <Stat label="Expiring ≤ 90d" value={stats.expiringSoon} tone="orange" />
        <Stat label="Expired" value={stats.expired} tone="red" />
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input
            className={`${field} max-w-xs flex-1`}
            placeholder="Search by name, reference, entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={`${field} w-auto`} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className={`${field} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {(search || statusFilter || supplierFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setSupplierFilter('') }}>
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-500">{filtered.length} of {contracts.length}</span>
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading contracts…" />
      ) : error ? (
        <Card>
          <CardBody className="flex items-center justify-between">
            <span className="text-sm text-red-300">{error}</span>
            <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
          </CardBody>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📄"
          title={contracts.length === 0 ? 'No contracts yet' : 'No contracts match your filters'}
          description={
            contracts.length === 0
              ? 'Add your master agreements so the desk can check increases against the caps you actually negotiated.'
              : 'Try clearing the search or filters.'
          }
          action={
            contracts.length === 0 ? (
              <Button onClick={() => { resetForm(); setCreateOpen(true) }}>+ New Contract</Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Contract</TH>
              <TH>Supplier</TH>
              <TH>Reference</TH>
              <TH>Term End</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((c) => {
              const d = daysUntil(c.term_end_date)
              return (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/dashboard/contracts/${c.id}`} className="font-medium text-slate-100 hover:text-orange-400">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c.governing_entity || 'No governing entity'} · v{c.version ?? 1}
                    </div>
                  </TD>
                  <TD>{c.supplier_id ? supplierName.get(c.supplier_id) ?? '—' : '—'}</TD>
                  <TD className="font-mono text-xs text-slate-400">{c.reference_number || '—'}</TD>
                  <TD>
                    <div>{fmtDate(c.term_end_date)}</div>
                    {d !== null && (
                      <div className={`text-xs ${d < 0 ? 'text-red-400' : d <= 90 ? 'text-orange-400' : 'text-slate-500'}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}
                      </div>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={verdictTone(c.status ?? 'neutral')}>{c.status || 'unknown'}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/dashboard/contracts/${c.id}`}>
                        <Button variant="secondary" size="sm">Open</Button>
                      </Link>
                      <Button variant="danger" size="sm" onClick={() => remove(c)}>Delete</Button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Contract"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitCreate} disabled={saving}>{saving ? 'Saving…' : 'Create Contract'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{formError}</div>
          )}
          <div>
            <label className={label}>Name *</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Master Supply Agreement 2024" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Supplier</label>
              <select className={field} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Reference #</label>
              <input className={field} value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="MSA-2024-0142" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={label}>Currency</label>
              <input className={field} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="USD" />
            </div>
            <div>
              <label className={label}>Effective Date</label>
              <input type="date" className={field} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </div>
            <div>
              <label className={label}>Term End</label>
              <input type="date" className={field} value={form.term_end_date} onChange={(e) => setForm({ ...form, term_end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Governing Entity</label>
              <input className={field} value={form.governing_entity} onChange={(e) => setForm({ ...form, governing_entity: e.target.value })} placeholder="Acme Corp (Delaware)" />
            </div>
            <div>
              <label className={label}>Status</label>
              <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea className={`${field} min-h-[72px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Negotiation context, key contacts…" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
