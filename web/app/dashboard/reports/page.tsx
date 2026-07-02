'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface SavingsRow {
  supplier_id?: string
  supplier_name?: string
  category_id?: string
  category_name?: string
  proposed_cents?: number
  accepted_cents?: number
  avoided_cents?: number
  letters?: number
}

interface SavingsReport {
  totals?: {
    proposed_cents?: number
    accepted_cents?: number
    avoided_cents?: number
    letters?: number
    contests_won?: number
  }
  by_supplier?: SavingsRow[]
  by_category?: SavingsRow[]
}

interface WavePeriod {
  period?: string
  letters?: number
  avg_proposed_pct?: number
  avg_entitled_pct?: number
  avg_over_ask_pct?: number
  breaches?: number
  proposed_cents?: number
  avoided_cents?: number
}

interface InflationWaveReport {
  periods?: WavePeriod[]
}

interface BehaviorRow {
  supplier_id?: string
  supplier_name?: string
  total_letters?: number
  contests_won?: number
  avg_over_ask_pct?: number
  behavior_score?: number
  total_avoided_cents?: number
}

type TabKey = 'savings' | 'wave' | 'behavior'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'savings', label: 'Savings', icon: '💰' },
  { key: 'wave', label: 'Inflation Wave', icon: '🌊' },
  { key: 'behavior', label: 'Supplier Behavior', icon: '📈' },
]

function fmtMoney(cents?: number) {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function fmtPct(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}%`
}

function shortId(id?: string) {
  if (!id) return '—'
  return id.slice(0, 8)
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function Bar({ value, max, tone = 'orange' }: { value: number; max: number; tone?: 'orange' | 'green' | 'red' }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const colors = { orange: 'bg-red-500', green: 'bg-emerald-500', red: 'bg-red-500' }
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('savings')

  const [savings, setSavings] = useState<SavingsReport | null>(null)
  const [wave, setWave] = useState<InflationWaveReport | null>(null)
  const [behavior, setBehavior] = useState<BehaviorRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, w, b] = await Promise.all([
        api.getSavingsReport(),
        api.getInflationWaveReport(),
        api.getSupplierBehaviorReport(),
      ])
      setSavings(s ?? null)
      setWave(w ?? null)
      setBehavior(Array.isArray(b) ? b : Array.isArray(b?.rows) ? b.rows : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const totals = savings?.totals ?? {}
  const bySupplier = savings?.by_supplier ?? []
  const byCategory = savings?.by_category ?? []
  const periods = wave?.periods ?? []

  const supplierMax = useMemo(
    () => Math.max(1, ...bySupplier.map((r) => r.avoided_cents ?? 0)),
    [bySupplier],
  )
  const waveMax = useMemo(
    () => Math.max(1, ...periods.map((p) => p.avg_proposed_pct ?? 0)),
    [periods],
  )
  const behaviorMax = useMemo(
    () => Math.max(1, ...behavior.map((b) => b.avg_over_ask_pct ?? 0)),
    [behavior],
  )

  function exportSavings() {
    const rows: (string | number)[][] = [['Supplier', 'Proposed', 'Accepted', 'Avoided', 'Letters']]
    for (const r of bySupplier) {
      rows.push([
        r.supplier_name ?? shortId(r.supplier_id),
        ((r.proposed_cents ?? 0) / 100).toFixed(2),
        ((r.accepted_cents ?? 0) / 100).toFixed(2),
        ((r.avoided_cents ?? 0) / 100).toFixed(2),
        r.letters ?? 0,
      ])
    }
    downloadCsv('savings-report.csv', rows)
  }

  function exportWave() {
    const rows: (string | number)[][] = [
      ['Period', 'Letters', 'Avg Proposed %', 'Avg Entitled %', 'Avg Over-Ask %', 'Breaches', 'Avoided'],
    ]
    for (const p of periods) {
      rows.push([
        p.period ?? '',
        p.letters ?? 0,
        (p.avg_proposed_pct ?? 0).toFixed(2),
        (p.avg_entitled_pct ?? 0).toFixed(2),
        (p.avg_over_ask_pct ?? 0).toFixed(2),
        p.breaches ?? 0,
        ((p.avoided_cents ?? 0) / 100).toFixed(2),
      ])
    }
    downloadCsv('inflation-wave-report.csv', rows)
  }

  function exportBehavior() {
    const rows: (string | number)[][] = [
      ['Supplier', 'Letters', 'Contests Won', 'Avg Over-Ask %', 'Behavior Score', 'Avoided'],
    ]
    for (const b of behavior) {
      rows.push([
        b.supplier_name ?? shortId(b.supplier_id),
        b.total_letters ?? 0,
        b.contests_won ?? 0,
        (b.avg_over_ask_pct ?? 0).toFixed(2),
        b.behavior_score ?? 0,
        ((b.total_avoided_cents ?? 0) / 100).toFixed(2),
      ])
    }
    downloadCsv('supplier-behavior-report.csv', rows)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports &amp; Exports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Quantify what your pushback program has avoided, and watch the next inflation wave coming.
          </p>
        </div>
        <Button variant="secondary" onClick={refresh} disabled={refreshing || loading}>
          {refreshing ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <PageSpinner label="Crunching report data…" />
      ) : error ? (
        <Card>
          <CardBody className="py-10 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={refresh}>
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Proposed Increase" value={fmtMoney(totals.proposed_cents)} tone="red" hint="Total annual ask across letters" />
            <Stat label="Accepted" value={fmtMoney(totals.accepted_cents)} hint="What was ultimately agreed" />
            <Stat label="Avoided" value={fmtMoney(totals.avoided_cents)} tone="green" hint="Savings vs. original ask" />
            <Stat
              label="Contests Won"
              value={`${totals.contests_won ?? 0}/${totals.letters ?? 0}`}
              tone="orange"
              hint="Letters successfully pushed back"
            />
          </div>

          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === t.key
                        ? 'bg-red-600 text-white'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    <span className="mr-1" aria-hidden>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={tab === 'savings' ? exportSavings : tab === 'wave' ? exportWave : exportBehavior}
              >
                Export CSV
              </Button>
            </CardHeader>

            <CardBody className="p-0">
              {tab === 'savings' && (
                <div className="space-y-6 p-5">
                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-neutral-200">Avoided savings by supplier</h3>
                    {bySupplier.length === 0 ? (
                      <EmptyState
                        icon="💰"
                        title="No savings recorded yet"
                        description="Contest and resolve some increase letters to see where your defense is paying off."
                      />
                    ) : (
                      <div className="space-y-2.5">
                        {[...bySupplier]
                          .sort((a, b) => (b.avoided_cents ?? 0) - (a.avoided_cents ?? 0))
                          .map((r) => (
                            <div key={r.supplier_id ?? r.supplier_name} className="grid grid-cols-12 items-center gap-3">
                              <div className="col-span-4 truncate text-sm text-neutral-300">
                                {r.supplier_name ?? shortId(r.supplier_id)}
                              </div>
                              <div className="col-span-5">
                                <Bar value={r.avoided_cents ?? 0} max={supplierMax} tone="green" />
                              </div>
                              <div className="col-span-3 text-right text-sm font-medium tabular-nums text-emerald-400">
                                {fmtMoney(r.avoided_cents)}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-neutral-200">Breakdown by category</h3>
                    {byCategory.length === 0 ? (
                      <p className="text-sm text-neutral-500">No category-level savings to show.</p>
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Category</TH>
                            <TH className="text-right">Proposed</TH>
                            <TH className="text-right">Accepted</TH>
                            <TH className="text-right">Avoided</TH>
                            <TH className="text-right">Letters</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {byCategory.map((r) => (
                            <TR key={r.category_id ?? r.category_name}>
                              <TD className="text-neutral-200">{r.category_name ?? shortId(r.category_id)}</TD>
                              <TD className="text-right tabular-nums">{fmtMoney(r.proposed_cents)}</TD>
                              <TD className="text-right tabular-nums">{fmtMoney(r.accepted_cents)}</TD>
                              <TD className="text-right tabular-nums text-emerald-400">{fmtMoney(r.avoided_cents)}</TD>
                              <TD className="text-right tabular-nums">{r.letters ?? 0}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                  </section>
                </div>
              )}

              {tab === 'wave' && (
                <div className="space-y-6 p-5">
                  {periods.length === 0 ? (
                    <EmptyState
                      icon="🌊"
                      title="No inflation-wave data yet"
                      description="As letters are logged across quarters, you will see proposed vs. entitled increases trend here."
                    />
                  ) : (
                    <>
                      <section>
                        <h3 className="mb-3 text-sm font-semibold text-neutral-200">
                          Average proposed increase by period
                        </h3>
                        <div className="flex items-end gap-3 overflow-x-auto pb-2">
                          {periods.map((p) => {
                            const h = waveMax > 0 ? Math.max(4, ((p.avg_proposed_pct ?? 0) / waveMax) * 160) : 4
                            const eh = waveMax > 0 ? Math.max(2, ((p.avg_entitled_pct ?? 0) / waveMax) * 160) : 2
                            return (
                              <div key={p.period} className="flex min-w-[3.5rem] flex-col items-center gap-1.5">
                                <div className="flex h-44 items-end gap-1">
                                  <div
                                    className="w-5 rounded-t bg-red-500"
                                    style={{ height: `${h}px` }}
                                    title={`Proposed ${fmtPct(p.avg_proposed_pct)}`}
                                  />
                                  <div
                                    className="w-5 rounded-t bg-sky-600"
                                    style={{ height: `${eh}px` }}
                                    title={`Entitled ${fmtPct(p.avg_entitled_pct)}`}
                                  />
                                </div>
                                <div className="text-[10px] font-medium text-neutral-400">{p.period}</div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Avg proposed %
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-sky-600" /> Avg entitled %
                          </span>
                        </div>
                      </section>

                      <section>
                        <Table>
                          <THead>
                            <TR>
                              <TH>Period</TH>
                              <TH className="text-right">Letters</TH>
                              <TH className="text-right">Proposed %</TH>
                              <TH className="text-right">Entitled %</TH>
                              <TH className="text-right">Over-Ask %</TH>
                              <TH className="text-right">Breaches</TH>
                              <TH className="text-right">Avoided</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {periods.map((p) => (
                              <TR key={p.period}>
                                <TD className="font-medium text-neutral-200">{p.period}</TD>
                                <TD className="text-right tabular-nums">{p.letters ?? 0}</TD>
                                <TD className="text-right tabular-nums text-red-400">{fmtPct(p.avg_proposed_pct)}</TD>
                                <TD className="text-right tabular-nums text-sky-400">{fmtPct(p.avg_entitled_pct)}</TD>
                                <TD className="text-right tabular-nums">{fmtPct(p.avg_over_ask_pct)}</TD>
                                <TD className="text-right">
                                  {(p.breaches ?? 0) > 0 ? (
                                    <Badge tone="red">{p.breaches}</Badge>
                                  ) : (
                                    <span className="text-neutral-600">0</span>
                                  )}
                                </TD>
                                <TD className="text-right tabular-nums text-emerald-400">{fmtMoney(p.avoided_cents)}</TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </section>
                    </>
                  )}
                </div>
              )}

              {tab === 'behavior' && (
                <div className="space-y-6 p-5">
                  {behavior.length === 0 ? (
                    <EmptyState
                      icon="📈"
                      title="No supplier behavior data yet"
                      description="Once suppliers have submitted increases, their over-ask patterns and behavior scores appear here."
                    />
                  ) : (
                    <>
                      <section>
                        <h3 className="mb-3 text-sm font-semibold text-neutral-200">
                          Average over-ask by supplier
                        </h3>
                        <div className="space-y-2.5">
                          {[...behavior]
                            .sort((a, b) => (b.avg_over_ask_pct ?? 0) - (a.avg_over_ask_pct ?? 0))
                            .map((b) => (
                              <div key={b.supplier_id ?? b.supplier_name} className="grid grid-cols-12 items-center gap-3">
                                <div className="col-span-4 truncate text-sm text-neutral-300">
                                  {b.supplier_name ?? shortId(b.supplier_id)}
                                </div>
                                <div className="col-span-5">
                                  <Bar value={b.avg_over_ask_pct ?? 0} max={behaviorMax} tone="red" />
                                </div>
                                <div className="col-span-3 text-right text-sm font-medium tabular-nums text-red-400">
                                  {fmtPct(b.avg_over_ask_pct)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </section>

                      <section>
                        <Table>
                          <THead>
                            <TR>
                              <TH>Supplier</TH>
                              <TH className="text-right">Letters</TH>
                              <TH className="text-right">Contests Won</TH>
                              <TH className="text-right">Avg Over-Ask %</TH>
                              <TH className="text-right">Behavior Score</TH>
                              <TH className="text-right">Avoided</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {behavior.map((b) => {
                              const score = b.behavior_score ?? 0
                              const tone = score >= 70 ? 'green' : score >= 40 ? 'amber' : 'red'
                              return (
                                <TR key={b.supplier_id ?? b.supplier_name}>
                                  <TD className="font-medium text-neutral-200">
                                    {b.supplier_name ?? shortId(b.supplier_id)}
                                  </TD>
                                  <TD className="text-right tabular-nums">{b.total_letters ?? 0}</TD>
                                  <TD className="text-right tabular-nums">{b.contests_won ?? 0}</TD>
                                  <TD className="text-right tabular-nums text-red-400">{fmtPct(b.avg_over_ask_pct)}</TD>
                                  <TD className="text-right">
                                    <Badge tone={tone}>{score}</Badge>
                                  </TD>
                                  <TD className="text-right tabular-nums text-emerald-400">
                                    {fmtMoney(b.total_avoided_cents)}
                                  </TD>
                                </TR>
                              )
                            })}
                          </TBody>
                        </Table>
                      </section>
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
