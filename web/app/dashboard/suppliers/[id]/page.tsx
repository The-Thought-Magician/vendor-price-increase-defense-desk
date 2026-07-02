'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
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

interface Scorecard {
  supplier_id?: string
  total_letters?: number
  contests_won?: number
  avg_over_ask_pct?: number
  behavior_score?: number
  total_avoided_cents?: number
  updated_at?: string
}

interface Letter {
  id: string
  title?: string
  proposed_pct?: number | null
  status?: string | null
  aggregate_verdict?: string | null
  defensibility_score?: number | null
  annual_impact_cents?: number | null
  received_date?: string | null
  effective_date?: string | null
  created_at?: string
}

function money(cents?: number | null) {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
}

function scoreTone(score?: number): 'green' | 'orange' | 'red' | 'default' {
  if (score == null) return 'default'
  if (score >= 70) return 'green'
  if (score >= 40) return 'orange'
  return 'red'
}

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    annual_spend: '',
    status: 'active',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [supRes, scRes, lettersRes] = await Promise.all([
        api.getSupplier(id),
        api.getSupplierScorecard(id).catch(() => null),
        api.getSupplierLetters(id).catch(() => []),
      ])
      const sup: Supplier = (supRes as { supplier?: Supplier }).supplier ?? (supRes as Supplier)
      setSupplier(sup)
      if (scRes) {
        const sc = (scRes as { scorecard?: Scorecard }).scorecard ?? (scRes as Scorecard)
        setScorecard(sc)
      }
      setLetters(Array.isArray(lettersRes) ? lettersRes : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load supplier')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function openEdit() {
    if (!supplier) return
    setForm({
      name: supplier.name ?? '',
      contact_name: supplier.contact_name ?? '',
      contact_email: supplier.contact_email ?? '',
      annual_spend: supplier.annual_spend_cents != null ? String(supplier.annual_spend_cents / 100) : '',
      status: supplier.status ?? 'active',
      notes: supplier.notes ?? '',
    })
    setFormError(null)
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!form.name.trim()) {
      setFormError('Name is required')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      await api.updateSupplier(id, {
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        annual_spend_cents: form.annual_spend ? Math.round(parseFloat(form.annual_spend) * 100) : null,
        status: form.status,
        notes: form.notes.trim() || null,
      })
      setEditOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const stats = useMemo(() => {
    const contested = letters.filter((l) => (l.aggregate_verdict ?? '').toLowerCase() === 'breach').length
    const totalImpact = letters.reduce((a, l) => a + (l.annual_impact_cents ?? 0), 0)
    const avgPct =
      letters.length > 0
        ? letters.reduce((a, l) => a + (l.proposed_pct ?? 0), 0) / letters.length
        : 0
    return { contested, totalImpact, avgPct }
  }, [letters])

  if (loading) return <PageSpinner label="Loading supplier..." />

  if (error || !supplier) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/suppliers" className="text-sm text-neutral-500 hover:text-red-400">
          ← Suppliers
        </Link>
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-400">{error ?? 'Supplier not found'}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                Retry
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const winRate =
    scorecard && scorecard.total_letters
      ? Math.round(((scorecard.contests_won ?? 0) / scorecard.total_letters) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/suppliers" className="text-sm text-neutral-500 hover:text-red-400">
            ← Suppliers
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-white">{supplier.name}</h1>
            {supplier.status && <Badge tone={verdictTone(supplier.status)}>{supplier.status}</Badge>}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {supplier.contact_name || 'No contact'}
            {supplier.contact_email && (
              <>
                {' · '}
                <a href={`mailto:${supplier.contact_email}`} className="text-neutral-400 hover:text-red-400">
                  {supplier.contact_email}
                </a>
              </>
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={openEdit}>
          Edit supplier
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Annual spend" value={money(supplier.annual_spend_cents)} tone="orange" />
        <Stat
          label="Behavior score"
          value={scorecard?.behavior_score != null ? Math.round(scorecard.behavior_score) : '—'}
          tone={scoreTone(scorecard?.behavior_score)}
          hint="Higher is better"
        />
        <Stat
          label="Avg over-ask"
          value={scorecard?.avg_over_ask_pct != null ? `${scorecard.avg_over_ask_pct.toFixed(1)}%` : '—'}
          hint="Above entitled increase"
        />
        <Stat label="Total avoided" value={money(scorecard?.total_avoided_cents)} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Negotiation scorecard</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            {scorecard ? (
              <>
                <ScoreRow label="Letters reviewed" value={scorecard.total_letters ?? 0} />
                <ScoreRow label="Contests won" value={scorecard.contests_won ?? 0} />
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Win rate</span>
                    <span className="font-semibold text-white tabular-nums">{winRate}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${winRate}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-400">Behavior</span>
                    <span className="font-semibold text-white tabular-nums">
                      {scorecard.behavior_score != null ? Math.round(scorecard.behavior_score) : 0}/100
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${
                        (scorecard.behavior_score ?? 0) >= 70
                          ? 'bg-emerald-500'
                          : (scorecard.behavior_score ?? 0) >= 40
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, scorecard.behavior_score ?? 0))}%` }}
                    />
                  </div>
                </div>
                {scorecard.updated_at && (
                  <p className="text-xs text-neutral-600">Updated {fmtDate(scorecard.updated_at)}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                No scorecard yet. It is computed from this supplier&apos;s reviewed letters.
              </p>
            )}
            {supplier.notes && (
              <div className="border-t border-neutral-800 pt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{supplier.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Letter history</h2>
            <div className="flex gap-4 text-xs text-neutral-500">
              <span>{letters.length} letters</span>
              <span className="text-red-400">{stats.contested} breaches</span>
              <span className="text-red-400">avg {stats.avgPct.toFixed(1)}% ask</span>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {letters.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon="✉️"
                  title="No letters"
                  description="No price-increase letters logged for this supplier yet."
                  action={
                    <Link href="/dashboard/letters/new">
                      <Button size="sm">Log a letter</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Letter</TH>
                    <TH className="text-right">Proposed</TH>
                    <TH>Verdict</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Impact</TH>
                    <TH>Received</TH>
                  </TR>
                </THead>
                <TBody>
                  {letters.map((l) => (
                    <TR key={l.id}>
                      <TD>
                        <Link href={`/dashboard/letters/${l.id}`} className="font-medium text-white hover:text-red-400">
                          {l.title || 'Untitled letter'}
                        </Link>
                        {l.defensibility_score != null && (
                          <div className="text-xs text-neutral-500">def. {Math.round(l.defensibility_score)}</div>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums text-red-400">
                        {l.proposed_pct != null ? `${l.proposed_pct.toFixed(1)}%` : '—'}
                      </TD>
                      <TD>{l.aggregate_verdict ? <Badge tone={verdictTone(l.aggregate_verdict)}>{l.aggregate_verdict}</Badge> : '—'}</TD>
                      <TD>{l.status ? <Badge tone={verdictTone(l.status)}>{l.status}</Badge> : '—'}</TD>
                      <TD className="text-right tabular-nums">{money(l.annual_impact_cents)}</TD>
                      <TD>{fmtDate(l.received_date ?? l.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit supplier"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
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
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="watch">watch</option>
            </select>
          </Field>
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
              />
            </Field>
          </div>
          <Field label="Annual spend (USD)">
            <input
              type="number"
              value={form.annual_spend}
              onChange={(e) => setForm({ ...form, annual_spend: e.target.value })}
              className={inputCls}
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

function ScoreRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="font-semibold text-white tabular-nums">{value}</span>
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
