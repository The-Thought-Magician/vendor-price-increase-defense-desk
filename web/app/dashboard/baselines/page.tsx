'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface Supplier {
  id: string
  name: string
  category_id?: string | null
}

interface Category {
  id: string
  name: string
}

interface Baseline {
  id: string
  workspace_id?: string
  supplier_id?: string | null
  category_id?: string | null
  period: string
  annual_spend_cents: number
  created_at?: string
}

interface FormState {
  supplier_id: string
  category_id: string
  period: string
  annual_spend: string
}

const emptyForm: FormState = { supplier_id: '', category_id: '', period: '', annual_spend: '' }

function fmtMoney(cents?: number | null) {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default function BaselinesPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [supplierFilter, setSupplierFilter] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Baseline | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async (supplierId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const [bl, sup, cat] = await Promise.all([
        api.getBaselines(supplierId || undefined),
        api.getSuppliers(),
        api.getCategories(),
      ])
      setBaselines(Array.isArray(bl) ? bl : [])
      setSuppliers(Array.isArray(sup) ? sup : [])
      setCategories(Array.isArray(cat) ? cat : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load baselines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(supplierFilter)
  }, [load, supplierFilter])

  const supplierName = useCallback(
    (id?: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8) : '—'),
    [suppliers],
  )
  const categoryName = useCallback(
    (id?: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? id.slice(0, 8) : '—'),
    [categories],
  )

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, supplier_id: supplierFilter })
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (b: Baseline) => {
    setEditing(b)
    setForm({
      supplier_id: b.supplier_id ?? '',
      category_id: b.category_id ?? '',
      period: b.period ?? '',
      annual_spend: b.annual_spend_cents != null ? String(b.annual_spend_cents / 100) : '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!form.period.trim()) {
        setFormError('Period is required (e.g. 2025 or 2025-Q1).')
        return
      }
      setSaving(true)
      setFormError(null)
      const payload = {
        supplier_id: form.supplier_id || null,
        category_id: form.category_id || null,
        period: form.period.trim(),
        annual_spend_cents: form.annual_spend === '' ? 0 : Math.round(Number(form.annual_spend) * 100),
      }
      try {
        if (editing) await api.updateBaseline(editing.id, payload)
        else await api.createBaseline(payload)
        setModalOpen(false)
        await load(supplierFilter)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to save baseline')
      } finally {
        setSaving(false)
      }
    },
    [form, editing, load, supplierFilter],
  )

  const remove = useCallback(
    async (b: Baseline) => {
      if (!confirm(`Delete the ${b.period} baseline for ${supplierName(b.supplier_id)}?`)) return
      try {
        await api.deleteBaseline(b.id)
        await load(supplierFilter)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete baseline')
      }
    },
    [load, supplierFilter, supplierName],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...baselines]
      .filter((b) => {
        if (!q) return true
        return (
          (b.period ?? '').toLowerCase().includes(q) ||
          supplierName(b.supplier_id).toLowerCase().includes(q) ||
          categoryName(b.category_id).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0))
  }, [baselines, search, supplierName, categoryName])

  const totalSpend = useMemo(
    () => filtered.reduce((sum, b) => sum + (b.annual_spend_cents ?? 0), 0),
    [filtered],
  )

  const periodChart = useMemo(() => {
    const byPeriod = new Map<string, number>()
    for (const b of filtered) {
      byPeriod.set(b.period, (byPeriod.get(b.period) ?? 0) + (b.annual_spend_cents ?? 0))
    }
    const rows = [...byPeriod.entries()]
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => (a.period < b.period ? -1 : 1))
    const max = Math.max(1, ...rows.map((r) => r.value))
    return { rows, max }
  }, [filtered])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Spend Baselines</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Track annual spend per supplier and category so price-increase impact can be measured against a known base.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => load(supplierFilter)} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
          <Button onClick={openCreate}>+ New baseline</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Baselines" value={filtered.length} />
        <Stat label="Total Annual Spend" value={fmtMoney(totalSpend)} tone="orange" />
        <Stat label="Periods Tracked" value={periodChart.rows.length} />
      </div>

      {periodChart.rows.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-neutral-200">Spend by period</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {periodChart.rows.map((r) => (
              <div key={r.period} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-neutral-400">{r.period}</div>
                <div className="flex h-6 flex-1 items-center overflow-hidden rounded bg-neutral-800/60">
                  <div
                    className="h-full rounded bg-red-500/80"
                    style={{ width: `${(r.value / periodChart.max) * 100}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right text-xs tabular-nums text-neutral-300">
                  {fmtMoney(r.value)}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-neutral-500">Supplier</label>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="min-w-[14rem] rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search period, supplier, category…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading baselines…" />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={() => load(supplierFilter)}>
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="📊"
                title={baselines.length === 0 ? 'No baselines yet' : 'No matching baselines'}
                description={
                  baselines.length === 0
                    ? 'Record annual spend per supplier or category to anchor your defense calculations.'
                    : 'Adjust the supplier filter or search to see more.'
                }
                action={
                  baselines.length === 0 ? (
                    <Button onClick={openCreate}>+ New baseline</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH>Supplier</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Annual Spend</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium text-neutral-200">{b.period}</TD>
                    <TD>{supplierName(b.supplier_id)}</TD>
                    <TD className="text-neutral-400">{categoryName(b.category_id)}</TD>
                    <TD className="text-right tabular-nums">{fmtMoney(b.annual_spend_cents)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(b)}>
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
        title={editing ? 'Edit baseline' : 'New baseline'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Create baseline'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Period <span className="text-red-400">*</span>
            </label>
            <input
              value={form.period}
              onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
              placeholder="2025 or 2025-Q1"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Supplier</label>
            <select
              value={form.supplier_id}
              onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="">— none —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 focus:border-red-500 focus:outline-none"
            >
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Annual spend ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.annual_spend}
              onChange={(e) => setForm((f) => ({ ...f, annual_spend: e.target.value }))}
              placeholder="0.00"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
