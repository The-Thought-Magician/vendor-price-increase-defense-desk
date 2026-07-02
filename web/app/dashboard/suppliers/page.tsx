'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Supplier {
  id: string
  name: string
  category_id?: string | null
  contact_name?: string | null
  contact_email?: string | null
  annual_spend_cents?: number | null
  status?: string | null
  notes?: string | null
}

interface Category {
  id: string
  name: string
}

interface Scorecard {
  supplier_id: string
  total_letters?: number
  contests_won?: number
  avg_over_ask_pct?: number
  behavior_score?: number
  total_avoided_cents?: number
}

function money(cents?: number | null) {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function scoreTone(score?: number): 'green' | 'amber' | 'red' | 'neutral' {
  if (score == null) return 'neutral'
  if (score >= 70) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

const emptyForm = {
  name: '',
  category_id: '',
  contact_name: '',
  contact_email: '',
  annual_spend: '',
  status: 'active',
  notes: '',
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [sup, cat] = await Promise.all([api.getSuppliers(), api.getCategories()])
      const list: Supplier[] = Array.isArray(sup) ? sup : []
      setSuppliers(list)
      setCategories(Array.isArray(cat) ? cat : [])
      // Fetch scorecards in parallel; tolerate individual failures.
      const cards = await Promise.all(
        list.map((s) =>
          api
            .getSupplierScorecard(s.id)
            .then((r: { scorecard?: Scorecard } | Scorecard) => {
              const sc = (r as { scorecard?: Scorecard }).scorecard ?? (r as Scorecard)
              return [s.id, sc] as const
            })
            .catch(() => [s.id, null] as const),
        ),
      )
      const map: Record<string, Scorecard> = {}
      for (const [id, sc] of cards) if (sc) map[id] = sc
      setScorecards(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryName = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of categories) m[c.id] = c.name
    return m
  }, [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return suppliers.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !(s.contact_name ?? '').toLowerCase().includes(q)) return false
      if (categoryFilter && s.category_id !== categoryFilter) return false
      if (statusFilter && (s.status ?? '') !== statusFilter) return false
      return true
    })
  }, [suppliers, search, categoryFilter, statusFilter])

  const totals = useMemo(() => {
    const spend = suppliers.reduce((a, s) => a + (s.annual_spend_cents ?? 0), 0)
    const avoided = Object.values(scorecards).reduce((a, c) => a + (c.total_avoided_cents ?? 0), 0)
    const letters = Object.values(scorecards).reduce((a, c) => a + (c.total_letters ?? 0), 0)
    return { spend, avoided, letters }
  }, [suppliers, scorecards])

  function openCreate() {
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      setFormError('Supplier name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.createSupplier({
        name: form.name.trim(),
        category_id: form.category_id || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        annual_spend_cents: form.annual_spend ? Math.round(parseFloat(form.annual_spend) * 100) : null,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create supplier')
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`Delete supplier "${s.name}"? This cannot be undone.`)) return
    try {
      await api.deleteSupplier(s.id)
      setSuppliers((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete supplier')
    }
  }

  const statuses = useMemo(
    () => Array.from(new Set(suppliers.map((s) => s.status).filter(Boolean))) as string[],
    [suppliers],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Suppliers</h1>
          <p className="mt-1 text-sm text-neutral-500">Vendor roster with negotiation scorecards.</p>
        </div>
        <Button onClick={openCreate}>+ New supplier</Button>
      </div>

      {!loading && !error && suppliers.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Suppliers" value={suppliers.length} />
          <Stat label="Annual spend" value={money(totals.spend)} tone="orange" />
          <Stat label="Letters reviewed" value={totals.letters} />
          <Stat label="Total avoided" value={money(totals.avoided)} tone="green" />
        </div>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or contact..."
            className="min-w-[200px] flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-600 focus:outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-600 focus:outline-none"
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {(search || categoryFilter || statusFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setCategoryFilter('')
                setStatusFilter('')
              }}
            >
              Clear
            </Button>
          )}
        </CardBody>
      </Card>

      {loading ? (
        <PageSpinner label="Loading suppliers..." />
      ) : error ? (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                Retry
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="No suppliers yet"
          description="Add the vendors you negotiate with to start tracking price-increase letters and behavior."
          action={<Button onClick={openCreate}>+ New supplier</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No matches" description="No suppliers match the current filters." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Supplier</TH>
              <TH>Category</TH>
              <TH>Status</TH>
              <TH className="text-right">Annual spend</TH>
              <TH className="text-right">Letters</TH>
              <TH className="text-right">Avg over-ask</TH>
              <TH className="text-right">Behavior</TH>
              <TH className="text-right">Avoided</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((s) => {
              const sc = scorecards[s.id]
              return (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/dashboard/suppliers/${s.id}`} className="font-medium text-white hover:text-red-400">
                      {s.name}
                    </Link>
                    {s.contact_name && <div className="text-xs text-neutral-500">{s.contact_name}</div>}
                  </TD>
                  <TD>{s.category_id ? categoryName[s.category_id] ?? '—' : '—'}</TD>
                  <TD>
                    {s.status ? <Badge tone={verdictTone(s.status)}>{s.status}</Badge> : '—'}
                  </TD>
                  <TD className="text-right tabular-nums">{money(s.annual_spend_cents)}</TD>
                  <TD className="text-right tabular-nums">{sc?.total_letters ?? 0}</TD>
                  <TD className="text-right tabular-nums">
                    {sc?.avg_over_ask_pct != null ? `${sc.avg_over_ask_pct.toFixed(1)}%` : '—'}
                  </TD>
                  <TD className="text-right">
                    {sc?.behavior_score != null ? (
                      <Badge tone={scoreTone(sc.behavior_score)}>{Math.round(sc.behavior_score)}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="text-right tabular-nums text-emerald-400">{money(sc?.total_avoided_cents)}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/dashboard/suppliers/${s.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                      <Button variant="danger" size="sm" onClick={() => remove(s)}>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New supplier"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving...' : 'Create supplier'}
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
          <Field label="Name" required>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder="Acme Materials Inc."
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className={inputCls}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputCls}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="watch">watch</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact name">
              <input
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Contact email">
              <input
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className={inputCls}
                placeholder="rep@vendor.com"
              />
            </Field>
          </div>
          <Field label="Annual spend (USD)">
            <input
              type="number"
              value={form.annual_spend}
              onChange={(e) => setForm({ ...form, annual_spend: e.target.value })}
              className={inputCls}
              placeholder="250000"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={`${inputCls} min-h-[72px]`}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-600 focus:outline-none'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  )
}
