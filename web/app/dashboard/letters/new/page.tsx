'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'

interface Supplier {
  id: string
  name?: string
}

interface Contract {
  id: string
  name?: string
  supplier_id?: string
  reference_number?: string
}

interface LineItemDraft {
  key: string
  sku: string
  description: string
  current_price: string
  proposed_price: string
  annual_volume: string
}

function newLine(): LineItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    sku: '',
    description: '',
    current_price: '',
    proposed_price: '',
    annual_volume: '',
  }
}

function toCents(v: string): number {
  const n = parseFloat(v)
  if (isNaN(n)) return 0
  return Math.round(n * 100)
}

function linePct(li: LineItemDraft): number | null {
  const cur = parseFloat(li.current_price)
  const prop = parseFloat(li.proposed_price)
  if (isNaN(cur) || isNaN(prop) || cur === 0) return null
  return ((prop - cur) / cur) * 100
}

function lineImpact(li: LineItemDraft): number {
  const cur = parseFloat(li.current_price)
  const prop = parseFloat(li.proposed_price)
  const vol = parseFloat(li.annual_volume)
  if (isNaN(cur) || isNaN(prop) || isNaN(vol)) return 0
  return (prop - cur) * vol
}

export default function NewLetterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [title, setTitle] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [contractId, setContractId] = useState('')
  const [proposedPct, setProposedPct] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [senderContact, setSenderContact] = useState('')
  const [justification, setJustification] = useState('')
  const [rawText, setRawText] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([newLine()])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [sups, cons] = await Promise.all([api.getSuppliers(), api.getContracts()])
        setSuppliers(Array.isArray(sups) ? sups : [])
        setContracts(Array.isArray(cons) ? cons : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load suppliers/contracts')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Contracts filtered by selected supplier (if any have supplier_id).
  const supplierContracts = useMemo(() => {
    if (!supplierId) return contracts
    const scoped = contracts.filter((c) => c.supplier_id === supplierId)
    return scoped.length ? scoped : contracts
  }, [contracts, supplierId])

  const totals = useMemo(() => {
    const active = lines.filter((l) => l.current_price || l.proposed_price || l.sku || l.description)
    const impact = active.reduce((sum, l) => sum + lineImpact(l), 0)
    return { count: active.length, impact }
  }, [lines])

  function updateLine(key: string, patch: Partial<LineItemDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? [newLine()] : prev.filter((l) => l.key !== key)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!supplierId) {
      setError('Select a supplier')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        supplier_id: supplierId,
      }
      if (contractId) body.contract_id = contractId
      if (proposedPct) body.proposed_pct = parseFloat(proposedPct)
      if (effectiveDate) body.effective_date = effectiveDate
      if (receivedDate) body.received_date = receivedDate
      if (senderContact.trim()) body.sender_contact = senderContact.trim()
      if (justification.trim()) body.justification = justification.trim()
      if (rawText.trim()) body.raw_text = rawText.trim()

      const res = await api.createLetter(body)
      const letter = res?.letter ?? res
      const letterId = letter?.id
      if (!letterId) throw new Error('Letter created but no id returned')

      // Add non-empty line items.
      const active = lines.filter(
        (l) => l.sku.trim() || l.description.trim() || l.current_price || l.proposed_price,
      )
      for (const l of active) {
        const itemBody: Record<string, unknown> = {
          sku: l.sku.trim() || null,
          description: l.description.trim() || null,
          current_price_cents: toCents(l.current_price),
          proposed_price_cents: toCents(l.proposed_price),
        }
        const pct = linePct(l)
        if (pct != null) itemBody.proposed_pct = pct
        const vol = parseFloat(l.annual_volume)
        if (!isNaN(vol)) itemBody.annual_volume = vol
        await api.addLineItem(letterId, itemBody)
      }

      router.push(`/dashboard/letters/${letterId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create letter')
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner label="Loading form..." />

  const inputCls =
    'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500'
  const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/letters" className="text-xs text-slate-500 hover:text-orange-400">
            ← Back to letters
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">New Increase Letter</h1>
          <p className="mt-1 text-sm text-slate-400">
            Log a supplier ask and its line items to begin analysis.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* Letter details */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Letter Details</h2>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 2026 Annual CPI uplift — Acme Logistics"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Supplier *</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value)
                  setContractId('')
                }}
                className={inputCls}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <p className="mt-1 text-xs text-amber-400">
                  No suppliers yet.{' '}
                  <Link href="/dashboard/suppliers" className="underline">
                    Add one first
                  </Link>
                  .
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Contract</label>
              <select
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className={inputCls}
              >
                <option value="">None / not linked</option>
                {supplierContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.reference_number || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Proposed increase (%)</label>
              <input
                type="number"
                step="0.1"
                value={proposedPct}
                onChange={(e) => setProposedPct(e.target.value)}
                placeholder="e.g. 7.5"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Sender contact</label>
              <input
                value={senderContact}
                onChange={(e) => setSenderContact(e.target.value)}
                placeholder="name / email"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Received date</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Effective date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Stated justification</label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Reason the supplier gives (e.g. raw material costs, CPI, labor)…"
                rows={2}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Raw letter text</label>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste the full letter text for the record and analysis…"
                rows={4}
                className={inputCls}
              />
            </div>
          </CardBody>
        </Card>

        {/* Line items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Line Items</h2>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {totals.count > 0 && (
                  <span>
                    Annual impact:{' '}
                    <span className="font-semibold tabular-nums text-orange-400">
                      {totals.impact.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </span>
                )}
                <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                  + Add line
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-xs text-slate-500">
              Optional. Prices in dollars per unit; the per-line increase % is computed
              automatically.
            </p>
            <div className="space-y-3">
              {lines.map((l, i) => {
                const pct = linePct(l)
                return (
                  <div
                    key={l.key}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Line {i + 1}</span>
                      <div className="flex items-center gap-2">
                        {pct != null && (
                          <Badge tone={pct > 0 ? 'red' : pct < 0 ? 'green' : 'neutral'}>
                            {pct > 0 ? '+' : ''}
                            {pct.toFixed(1)}%
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          className="text-xs text-slate-500 hover:text-red-400"
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <div>
                        <label className={labelCls}>SKU</label>
                        <input
                          value={l.sku}
                          onChange={(e) => updateLine(l.key, { sku: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <label className={labelCls}>Description</label>
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Current ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={l.current_price}
                          onChange={(e) => updateLine(l.key, { current_price: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Proposed ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={l.proposed_price}
                          onChange={(e) => updateLine(l.key, { proposed_price: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Annual volume</label>
                        <input
                          type="number"
                          step="1"
                          value={l.annual_volume}
                          onChange={(e) => updateLine(l.key, { annual_volume: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/letters">
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Letter'}
          </Button>
        </div>
      </form>
    </div>
  )
}
