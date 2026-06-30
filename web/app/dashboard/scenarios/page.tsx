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

interface Letter {
  id: string
  title?: string
  proposed_pct?: number
  status?: string
  supplier_id?: string
  annual_impact_cents?: number
}

interface Scenario {
  id: string
  letter_id: string
  name: string
  scenario_type: string
  applied_pct: number
  annual_impact_cents: number
  is_recommended?: boolean
  detail?: string | null
  created_at?: string
}

const SCENARIO_TYPES = ['accept', 'capped', 'indexed', 'reject', 'custom']

function fmtMoney(cents?: number | null) {
  if (cents === undefined || cents === null || Number.isNaN(cents)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtPct(pct?: number | null) {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return '—'
  return `${pct.toFixed(2)}%`
}

function typeTone(t?: string) {
  const v = (t ?? '').toLowerCase()
  if (v === 'reject') return 'red'
  if (v === 'accept') return 'amber'
  if (v === 'capped' || v === 'indexed') return 'green'
  return 'blue'
}

export default function ScenariosPage() {
  const [letters, setLetters] = useState<Letter[]>([])
  const [lettersLoading, setLettersLoading] = useState(true)
  const [lettersError, setLettersError] = useState<string | null>(null)
  const [activeLetterId, setActiveLetterId] = useState<string>('')

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scenariosLoading, setScenariosLoading] = useState(false)
  const [scenariosError, setScenariosError] = useState<string | null>(null)
  const [modeling, setModeling] = useState(false)

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    scenario_type: 'custom',
    applied_pct: '',
    annual_impact_cents: '',
    detail: '',
  })

  const loadLetters = useCallback(async () => {
    setLettersLoading(true)
    setLettersError(null)
    try {
      const data = await api.getLetters()
      const list: Letter[] = Array.isArray(data) ? data : []
      setLetters(list)
      setActiveLetterId((prev) => prev || (list[0]?.id ?? ''))
    } catch (e) {
      setLettersError(e instanceof Error ? e.message : 'Failed to load letters')
    } finally {
      setLettersLoading(false)
    }
  }, [])

  const loadScenarios = useCallback(async (letterId: string) => {
    if (!letterId) {
      setScenarios([])
      return
    }
    setScenariosLoading(true)
    setScenariosError(null)
    try {
      const data = await api.getScenarios(letterId)
      setScenarios(Array.isArray(data) ? data : [])
    } catch (e) {
      setScenariosError(e instanceof Error ? e.message : 'Failed to load scenarios')
    } finally {
      setScenariosLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLetters()
  }, [loadLetters])

  useEffect(() => {
    loadScenarios(activeLetterId)
  }, [activeLetterId, loadScenarios])

  const activeLetter = useMemo(
    () => letters.find((l) => l.id === activeLetterId) ?? null,
    [letters, activeLetterId],
  )

  const model = useCallback(async () => {
    if (!activeLetterId) return
    setModeling(true)
    setScenariosError(null)
    try {
      const data = await api.modelScenarios(activeLetterId)
      if (Array.isArray(data)) setScenarios(data)
      else await loadScenarios(activeLetterId)
    } catch (e) {
      setScenariosError(e instanceof Error ? e.message : 'Failed to model scenarios')
    } finally {
      setModeling(false)
    }
  }, [activeLetterId, loadScenarios])

  const submitCustom = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!activeLetterId) return
      setSaving(true)
      setFormError(null)
      try {
        await api.createScenario({
          letter_id: activeLetterId,
          name: form.name.trim() || 'Custom scenario',
          scenario_type: form.scenario_type,
          applied_pct: form.applied_pct === '' ? 0 : Number(form.applied_pct),
          annual_impact_cents:
            form.annual_impact_cents === ''
              ? 0
              : Math.round(Number(form.annual_impact_cents) * 100),
          detail: form.detail.trim() || null,
        })
        setCreateOpen(false)
        setForm({ name: '', scenario_type: 'custom', applied_pct: '', annual_impact_cents: '', detail: '' })
        await loadScenarios(activeLetterId)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to create scenario')
      } finally {
        setSaving(false)
      }
    },
    [activeLetterId, form, loadScenarios],
  )

  const remove = useCallback(
    async (s: Scenario) => {
      if (!confirm(`Delete scenario "${s.name}"?`)) return
      try {
        await api.deleteScenario(s.id)
        await loadScenarios(activeLetterId)
      } catch (e) {
        setScenariosError(e instanceof Error ? e.message : 'Failed to delete scenario')
      }
    },
    [activeLetterId, loadScenarios],
  )

  const visibleScenarios = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scenarios
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.scenario_type ?? '').toLowerCase().includes(q) ||
        (s.detail ?? '').toLowerCase().includes(q),
    )
  }, [scenarios, search])

  const chart = useMemo(() => {
    const rows = scenarios.map((s) => ({
      label: s.name,
      type: s.scenario_type,
      value: s.annual_impact_cents ?? 0,
      recommended: !!s.is_recommended,
    }))
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
    return { rows, max }
  }, [scenarios])

  const recommended = useMemo(() => scenarios.find((s) => s.is_recommended) ?? null, [scenarios])
  const bestSaving = useMemo(() => {
    if (!scenarios.length) return null
    return scenarios.reduce((min, s) =>
      (s.annual_impact_cents ?? 0) < (min.annual_impact_cents ?? 0) ? s : min,
    )
  }, [scenarios])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Counter-Offer Modeling</h1>
          <p className="mt-1 text-sm text-slate-500">
            Compare accept, capped, indexed, and reject outcomes side by side to pick the strongest counter.
          </p>
        </div>
        <Button variant="secondary" onClick={loadLetters} disabled={lettersLoading}>
          {lettersLoading ? <Spinner className="h-4 w-4" /> : 'Refresh letters'}
        </Button>
      </div>

      {lettersLoading ? (
        <PageSpinner label="Loading letters…" />
      ) : lettersError ? (
        <Card>
          <CardBody className="text-center">
            <p className="text-sm text-red-400">{lettersError}</p>
            <Button variant="secondary" className="mt-4" onClick={loadLetters}>
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : letters.length === 0 ? (
        <EmptyState
          icon="📨"
          title="No letters to model"
          description="Log a price-increase letter first, then model counter-offer scenarios against it here."
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <label className="text-xs uppercase tracking-wide text-slate-500">Letter</label>
                <select
                  value={activeLetterId}
                  onChange={(e) => setActiveLetterId(e.target.value)}
                  className="min-w-[16rem] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                >
                  {letters.map((l) => (
                    <option key={l.id} value={l.id}>
                      {(l.title || `Letter ${l.id.slice(0, 8)}`) +
                        (l.proposed_pct != null ? ` · +${l.proposed_pct}%` : '')}
                    </option>
                  ))}
                </select>
                {activeLetter?.status && (
                  <Badge tone={verdictTone(activeLetter.status)}>{activeLetter.status}</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={model} disabled={modeling || !activeLetterId}>
                  {modeling ? <Spinner className="h-4 w-4" /> : 'Model scenarios'}
                </Button>
                <Button variant="secondary" onClick={() => setCreateOpen(true)} disabled={!activeLetterId}>
                  + Custom
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Scenarios" value={scenarios.length} />
                <Stat
                  label="Proposed Impact"
                  value={fmtMoney(activeLetter?.annual_impact_cents)}
                  tone="red"
                />
                <Stat
                  label="Recommended"
                  value={recommended ? recommended.name : '—'}
                  tone="green"
                  hint={recommended ? fmtPct(recommended.applied_pct) : undefined}
                />
                <Stat
                  label="Lowest Impact"
                  value={fmtMoney(bestSaving?.annual_impact_cents)}
                  tone="green"
                  hint={bestSaving ? bestSaving.name : undefined}
                />
              </div>
            </CardBody>
          </Card>

          {scenarios.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Annual impact comparison</h2>
              </CardHeader>
              <CardBody className="space-y-3">
                {chart.rows.map((r, i) => (
                  <div key={`${r.label}-${i}`} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-xs text-slate-400" title={r.label}>
                      {r.label}
                    </div>
                    <div className="flex h-6 flex-1 items-center overflow-hidden rounded bg-slate-800/60">
                      <div
                        className={`h-full rounded ${
                          r.recommended ? 'bg-emerald-500' : 'bg-orange-500/80'
                        }`}
                        style={{ width: `${(Math.abs(r.value) / chart.max) * 100}%` }}
                      />
                    </div>
                    <div className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-300">
                      {fmtMoney(r.value)}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Scenario set</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter scenarios…"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-64"
              />
            </CardHeader>
            <CardBody className="p-0">
              {scenariosLoading ? (
                <PageSpinner label="Loading scenarios…" />
              ) : scenariosError ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-red-400">{scenariosError}</p>
                  <Button
                    variant="secondary"
                    className="mt-4"
                    onClick={() => loadScenarios(activeLetterId)}
                  >
                    Try again
                  </Button>
                </div>
              ) : visibleScenarios.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon="🧮"
                    title={scenarios.length === 0 ? 'No scenarios modeled' : 'No matching scenarios'}
                    description={
                      scenarios.length === 0
                        ? 'Click “Model scenarios” to generate accept / capped / indexed / reject options, or add a custom one.'
                        : 'Adjust your filter to see more.'
                    }
                    action={
                      scenarios.length === 0 ? (
                        <Button onClick={model} disabled={modeling}>
                          {modeling ? <Spinner className="h-4 w-4" /> : 'Model scenarios'}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Type</TH>
                      <TH className="text-right">Applied %</TH>
                      <TH className="text-right">Annual Impact</TH>
                      <TH>Detail</TH>
                      <TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {visibleScenarios.map((s) => (
                      <TR key={s.id} className={s.is_recommended ? 'bg-emerald-950/20' : ''}>
                        <TD className="font-medium text-slate-200">
                          <div className="flex items-center gap-2">
                            {s.name}
                            {s.is_recommended && <Badge tone="green">Recommended</Badge>}
                          </div>
                        </TD>
                        <TD>
                          <Badge tone={typeTone(s.scenario_type)}>{s.scenario_type}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums">{fmtPct(s.applied_pct)}</TD>
                        <TD className="text-right tabular-nums">{fmtMoney(s.annual_impact_cents)}</TD>
                        <TD className="text-xs text-slate-500">
                          <span className="block max-w-xs truncate" title={s.detail ?? ''}>
                            {s.detail || '—'}
                          </span>
                        </TD>
                        <TD className="text-right">
                          <Button size="sm" variant="danger" onClick={() => remove(s)}>
                            Delete
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add custom scenario"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCustom} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : 'Save scenario'}
            </Button>
          </>
        }
      >
        <form onSubmit={submitCustom} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Counter at index-entitled %"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Type</label>
            <select
              value={form.scenario_type}
              onChange={(e) => setForm((f) => ({ ...f, scenario_type: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            >
              {SCENARIO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Applied %
              </label>
              <input
                type="number"
                step="0.01"
                value={form.applied_pct}
                onChange={(e) => setForm((f) => ({ ...f, applied_pct: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">
                Annual impact ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.annual_impact_cents}
                onChange={(e) => setForm((f) => ({ ...f, annual_impact_cents: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Detail</label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              rows={3}
              placeholder="Rationale or notes for this scenario…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
