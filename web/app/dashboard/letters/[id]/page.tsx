'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Stat } from '@/components/ui/Stat'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

// ---------- types ----------
interface Letter {
  id: string
  workspace_id?: string
  supplier_id?: string | null
  contract_id?: string | null
  title?: string
  proposed_pct?: number | null
  effective_date?: string | null
  received_date?: string | null
  justification?: string | null
  raw_text?: string | null
  sender_contact?: string | null
  status?: string | null
  defensibility_score?: number | null
  aggregate_verdict?: string | null
  annual_impact_cents?: number | null
  created_at?: string
}
interface LineItem {
  id: string
  sku?: string | null
  description?: string | null
  current_price_cents?: number | null
  proposed_price_cents?: number | null
  proposed_pct?: number | null
  annual_volume?: number | null
}
interface ClauseCheck {
  id: string
  clause_type?: string
  verdict?: string
  severity?: string
  detail?: string
  citation_text?: string
  expected_value?: string
  actual_value?: string
}
interface IndexValidation {
  id: string
  index_id?: string
  claimed_pct?: number | null
  base_period?: string
  current_period?: string
  base_value?: number | null
  current_value?: number | null
  actual_pct?: number | null
  entitled_pct?: number | null
  over_ask_pct?: number | null
  detail?: string
}
interface CreepRecord {
  id: string
  cumulative_pct?: number | null
  cap_pct?: number | null
  breached?: boolean
  timeline?: { period?: string; pct?: number; label?: string }[]
  created_at?: string
}
interface Comment {
  id: string
  author?: string
  body?: string
  created_at?: string
}
interface Scenario {
  id: string
  name?: string
  scenario_type?: string
  applied_pct?: number | null
  annual_impact_cents?: number | null
  is_recommended?: boolean
  detail?: string
}
interface DocumentRow {
  id: string
  name?: string
  doc_type?: string
  content?: string
  url?: string
  created_at?: string
}

// ---------- helpers ----------
function money(cents?: number | null) {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString()
}
function unwrap<T>(res: unknown, key: string): T | null {
  if (res && typeof res === 'object' && key in (res as Record<string, unknown>)) {
    return (res as Record<string, unknown>)[key] as T
  }
  return (res as T) ?? null
}
function asArray<T>(res: unknown): T[] {
  return Array.isArray(res) ? (res as T[]) : []
}
function defTone(score?: number | null): 'green' | 'orange' | 'red' | 'default' {
  if (score == null) return 'default'
  if (score >= 70) return 'green'
  if (score >= 40) return 'orange'
  return 'red'
}
function sevTone(sev?: string) {
  return verdictTone(
    (sev ?? '').toLowerCase() === 'high'
      ? 'breach'
      : (sev ?? '').toLowerCase() === 'medium'
        ? 'warning'
        : 'compliant',
  )
}

const STATUSES = ['logged', 'under-review', 'contested', 'packet-ready', 'sent', 'accepted', 'rejected', 'resolved']
const TABS = ['Analysis', 'Line items', 'Scenarios', 'Comments', 'Documents', 'Packet'] as const
type Tab = (typeof TABS)[number]

export default function LetterWorkspacePage() {
  const params = useParams<{ id: string }>()
  const id = params.id

  const [letter, setLetter] = useState<Letter | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [checks, setChecks] = useState<ClauseCheck[]>([])
  const [validations, setValidations] = useState<IndexValidation[]>([])
  const [creep, setCreep] = useState<CreepRecord[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('Analysis')
  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setBanner({ kind, msg })
    setTimeout(() => setBanner(null), 4000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getLetter(id)
      const lt = unwrap<Letter>(res, 'letter')
      setLetter(lt)
      // detail endpoint may already bundle related data; fall back to dedicated calls.
      const bundled = res as Record<string, unknown>
      const [li, cc, iv, cm, sc, docs] = await Promise.all([
        Array.isArray(bundled.line_items) ? Promise.resolve(bundled.line_items) : api.getLineItems(id),
        Array.isArray(bundled.clause_checks) ? Promise.resolve(bundled.clause_checks) : api.getClauseChecks(id),
        Array.isArray(bundled.index_validations) ? Promise.resolve(bundled.index_validations) : api.getIndexValidations(id),
        api.getComments(id).catch(() => []),
        api.getScenarios(id).catch(() => []),
        api.getDocuments({ letter_id: id }).catch(() => []),
      ])
      setLineItems(asArray<LineItem>(li))
      setChecks(asArray<ClauseCheck>(cc))
      setValidations(asArray<IndexValidation>(iv))
      setComments(asArray<Comment>(cm))
      setScenarios(asArray<Scenario>(sc))
      setDocuments(asArray<DocumentRow>(docs))
      // creep is contract-scoped
      const contractId = lt?.contract_id
      if (contractId) {
        const cr = Array.isArray(bundled.creep) ? bundled.creep : await api.getCreep(contractId).catch(() => [])
        setCreep(asArray<CreepRecord>(cr))
      } else {
        setCreep([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load letter')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // ---------- actions ----------
  async function changeStatus(status: string) {
    if (!letter) return
    setBusy('status')
    try {
      const res = await api.setLetterStatus(id, status)
      setLetter(unwrap<Letter>(res, 'letter') ?? { ...letter, status })
      await api
        .recordAudit({ entity_type: 'letter', entity_id: id, action: 'status_change', detail: { status } })
        .catch(() => {})
      flash('ok', `Status set to ${status}`)
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Failed to set status')
    } finally {
      setBusy(null)
    }
  }

  async function runChecks() {
    setBusy('checks')
    try {
      const res = await api.runClauseChecks(id)
      const list = unwrap<ClauseCheck[]>(res, 'checks')
      setChecks(Array.isArray(list) ? list : asArray<ClauseCheck>(await api.getClauseChecks(id)))
      const agg = unwrap<string>(res, 'aggregate_verdict')
      const def = unwrap<number>(res, 'defensibility_score')
      setLetter((p) => (p ? { ...p, aggregate_verdict: agg ?? p.aggregate_verdict, defensibility_score: def ?? p.defensibility_score } : p))
      flash('ok', 'Clause checks complete')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Clause check failed')
    } finally {
      setBusy(null)
    }
  }

  async function runValidation(body: { index_id?: string; base_period?: string; current_period?: string }) {
    setBusy('validate')
    try {
      await api.runIndexValidation({ letter_id: id, ...body })
      setValidations(asArray<IndexValidation>(await api.getIndexValidations(id)))
      flash('ok', 'Index validation complete')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setBusy(null)
    }
  }

  async function runCreep() {
    if (!letter?.contract_id) {
      flash('err', 'Letter has no linked contract')
      return
    }
    setBusy('creep')
    try {
      await api.computeCreep(letter.contract_id)
      setCreep(asArray<CreepRecord>(await api.getCreep(letter.contract_id)))
      flash('ok', 'Cumulative creep computed')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Creep computation failed')
    } finally {
      setBusy(null)
    }
  }

  async function runScenarios() {
    setBusy('scenarios')
    try {
      const res = await api.modelScenarios(id)
      setScenarios(Array.isArray(res) ? (res as Scenario[]) : asArray<Scenario>(await api.getScenarios(id)))
      flash('ok', 'Scenarios modeled')
    } catch (e) {
      flash('err', e instanceof Error ? e.message : 'Scenario modeling failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageSpinner label="Loading letter..." />

  if (error || !letter) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/letters" className="text-sm text-slate-500 hover:text-orange-400">
          ← Letters
        </Link>
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-400">{error ?? 'Letter not found'}</p>
              <Button variant="secondary" size="sm" onClick={load}>
                Retry
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const breaches = checks.filter((c) => (c.verdict ?? '').toLowerCase() === 'breach').length

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/letters" className="text-sm text-slate-500 hover:text-orange-400">
            ← Letters
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-white">{letter.title || 'Untitled letter'}</h1>
            {letter.aggregate_verdict && <Badge tone={verdictTone(letter.aggregate_verdict)}>{letter.aggregate_verdict}</Badge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Proposed{' '}
            <span className="font-medium text-orange-400">
              {letter.proposed_pct != null ? `${letter.proposed_pct.toFixed(1)}%` : '—'}
            </span>{' '}
            · received {fmtDate(letter.received_date)} · effective {fmtDate(letter.effective_date)}
            {letter.supplier_id && (
              <>
                {' · '}
                <Link href={`/dashboard/suppliers/${letter.supplier_id}`} className="text-slate-400 hover:text-orange-400">
                  supplier
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={letter.status ?? ''}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={busy === 'status'}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-600 focus:outline-none"
          >
            {!letter.status && <option value="">Set status...</option>}
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ApprovalButton letterId={id} onDone={(m) => flash('ok', m)} onErr={(m) => flash('err', m)} />
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
              : 'border-red-800/60 bg-red-950/40 text-red-300'
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Defensibility"
          value={letter.defensibility_score != null ? Math.round(letter.defensibility_score) : '—'}
          tone={defTone(letter.defensibility_score) === 'default' ? 'default' : defTone(letter.defensibility_score)}
          hint="Higher = harder to defend"
        />
        <Stat label="Annual impact" value={money(letter.annual_impact_cents)} tone="orange" />
        <Stat label="Clause breaches" value={breaches} tone={breaches > 0 ? 'red' : 'green'} />
        <Stat label="Line items" value={lineItems.length} />
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-orange-500 text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Analysis' && (
        <AnalysisTab
          letter={letter}
          checks={checks}
          validations={validations}
          creep={creep}
          busy={busy}
          onRunChecks={runChecks}
          onRunValidation={runValidation}
          onRunCreep={runCreep}
        />
      )}
      {tab === 'Line items' && (
        <LineItemsTab
          letterId={id}
          items={lineItems}
          onChange={setLineItems}
          onErr={(m) => flash('err', m)}
        />
      )}
      {tab === 'Scenarios' && (
        <ScenariosTab
          scenarios={scenarios}
          busy={busy === 'scenarios'}
          onModel={runScenarios}
        />
      )}
      {tab === 'Comments' && (
        <CommentsTab
          letterId={id}
          comments={comments}
          onChange={setComments}
          onErr={(m) => flash('err', m)}
        />
      )}
      {tab === 'Documents' && (
        <DocumentsTab
          letterId={id}
          documents={documents}
          onChange={setDocuments}
          onErr={(m) => flash('err', m)}
        />
      )}
      {tab === 'Packet' && (
        <PacketTab
          letterId={id}
          onErr={(m) => flash('err', m)}
          onOk={(m) => flash('ok', m)}
        />
      )}
    </div>
  )
}

// ============== Analysis ==============
function AnalysisTab({
  letter,
  checks,
  validations,
  creep,
  busy,
  onRunChecks,
  onRunValidation,
  onRunCreep,
}: {
  letter: Letter
  checks: ClauseCheck[]
  validations: IndexValidation[]
  creep: CreepRecord[]
  busy: string | null
  onRunChecks: () => void
  onRunValidation: (b: { index_id?: string; base_period?: string; current_period?: string }) => void
  onRunCreep: () => void
}) {
  const [valOpen, setValOpen] = useState(false)
  const [indices, setIndices] = useState<{ id: string; code?: string; name?: string }[]>([])
  const [valForm, setValForm] = useState({ index_id: '', base_period: '', current_period: '' })

  useEffect(() => {
    if (valOpen && indices.length === 0) {
      api.getIndices().then((r) => setIndices(asArray(r))).catch(() => {})
    }
  }, [valOpen, indices.length])

  const latestCreep = creep[0]

  return (
    <div className="space-y-6">
      {/* clause checks */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Clause checks</h2>
            <p className="text-xs text-slate-500">Validate against contract caps, notice, and fixed-period terms.</p>
          </div>
          <Button size="sm" onClick={onRunChecks} disabled={busy === 'checks'}>
            {busy === 'checks' ? <Spinner className="h-4 w-4" /> : 'Run clause checks'}
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          {checks.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="⚖️" title="No clause checks" description="Run the engine to compare this increase against contract terms." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Clause</TH>
                  <TH>Verdict</TH>
                  <TH>Severity</TH>
                  <TH>Expected</TH>
                  <TH>Actual</TH>
                  <TH>Detail</TH>
                </TR>
              </THead>
              <TBody>
                {checks.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium text-white">{c.clause_type || '—'}</TD>
                    <TD>{c.verdict ? <Badge tone={verdictTone(c.verdict)}>{c.verdict}</Badge> : '—'}</TD>
                    <TD>{c.severity ? <Badge tone={sevTone(c.severity)}>{c.severity}</Badge> : '—'}</TD>
                    <TD className="tabular-nums">{c.expected_value ?? '—'}</TD>
                    <TD className="tabular-nums">{c.actual_value ?? '—'}</TD>
                    <TD className="max-w-xs text-xs text-slate-400">{c.detail ?? c.citation_text ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* index validation */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Index validation</h2>
            <p className="text-xs text-slate-500">Check the claimed increase against the contractual index movement.</p>
          </div>
          <Button size="sm" onClick={() => setValOpen(true)} disabled={busy === 'validate'}>
            {busy === 'validate' ? <Spinner className="h-4 w-4" /> : 'Run validation'}
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          {validations.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="📈" title="No validations" description="Run an index validation to compute the entitled vs claimed increase." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Periods</TH>
                  <TH className="text-right">Index move</TH>
                  <TH className="text-right">Entitled</TH>
                  <TH className="text-right">Claimed</TH>
                  <TH className="text-right">Over-ask</TH>
                </TR>
              </THead>
              <TBody>
                {validations.map((v) => (
                  <TR key={v.id}>
                    <TD className="text-xs">
                      {v.base_period || '?'} → {v.current_period || '?'}
                      {v.detail && <div className="text-slate-500">{v.detail}</div>}
                    </TD>
                    <TD className="text-right tabular-nums">{v.actual_pct != null ? `${v.actual_pct.toFixed(1)}%` : '—'}</TD>
                    <TD className="text-right tabular-nums text-emerald-400">
                      {v.entitled_pct != null ? `${v.entitled_pct.toFixed(1)}%` : '—'}
                    </TD>
                    <TD className="text-right tabular-nums text-orange-400">
                      {v.claimed_pct != null ? `${v.claimed_pct.toFixed(1)}%` : '—'}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {v.over_ask_pct != null ? (
                        <Badge tone={v.over_ask_pct > 0 ? 'red' : 'green'}>
                          {v.over_ask_pct > 0 ? '+' : ''}
                          {v.over_ask_pct.toFixed(1)}%
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* cumulative creep */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Cumulative creep</h2>
            <p className="text-xs text-slate-500">
              {letter.contract_id ? 'Stacked increases across the contract vs the cumulative cap.' : 'No contract linked to this letter.'}
            </p>
          </div>
          <Button size="sm" onClick={onRunCreep} disabled={busy === 'creep' || !letter.contract_id}>
            {busy === 'creep' ? <Spinner className="h-4 w-4" /> : 'Compute creep'}
          </Button>
        </CardHeader>
        <CardBody>
          {!latestCreep ? (
            <EmptyState icon="📊" title="No creep record" description="Compute cumulative creep to see stacked increases against the cap." />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label="Cumulative" value={latestCreep.cumulative_pct != null ? `${latestCreep.cumulative_pct.toFixed(1)}%` : '—'} tone="orange" />
                <Stat label="Cap" value={latestCreep.cap_pct != null ? `${latestCreep.cap_pct.toFixed(1)}%` : '—'} />
                <Stat label="Status" value={latestCreep.breached ? 'Breached' : 'Within cap'} tone={latestCreep.breached ? 'red' : 'green'} />
              </div>
              <CreepChart record={latestCreep} />
            </div>
          )}
        </CardBody>
      </Card>

      {(letter.justification || letter.raw_text) && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-white">Supplier justification</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {letter.justification && <p className="whitespace-pre-wrap text-sm text-slate-300">{letter.justification}</p>}
            {letter.raw_text && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Raw letter text</summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{letter.raw_text}</p>
              </details>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={valOpen}
        onClose={() => setValOpen(false)}
        title="Run index validation"
        footer={
          <>
            <Button variant="secondary" onClick={() => setValOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onRunValidation({
                  index_id: valForm.index_id || undefined,
                  base_period: valForm.base_period || undefined,
                  current_period: valForm.current_period || undefined,
                })
                setValOpen(false)
              }}
            >
              Run
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldLite label="Index">
            <select
              value={valForm.index_id}
              onChange={(e) => setValForm({ ...valForm, index_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Use contract clause basket</option>
              {indices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code ? `${i.code} — ${i.name ?? ''}` : i.name ?? i.id}
                </option>
              ))}
            </select>
          </FieldLite>
          <div className="grid grid-cols-2 gap-4">
            <FieldLite label="Base period">
              <input
                value={valForm.base_period}
                onChange={(e) => setValForm({ ...valForm, base_period: e.target.value })}
                className={inputCls}
                placeholder="2024-Q1"
              />
            </FieldLite>
            <FieldLite label="Current period">
              <input
                value={valForm.current_period}
                onChange={(e) => setValForm({ ...valForm, current_period: e.target.value })}
                className={inputCls}
                placeholder="2025-Q1"
              />
            </FieldLite>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function CreepChart({ record }: { record: CreepRecord }) {
  const timeline = record.timeline ?? []
  if (timeline.length === 0) return null
  const cap = record.cap_pct ?? 0
  const max = Math.max(cap, record.cumulative_pct ?? 0, ...timeline.map((t) => t.pct ?? 0), 1)
  return (
    <div>
      <div className="flex items-end gap-3 border-l border-b border-slate-800 px-3 pt-2" style={{ height: 160 }}>
        {timeline.map((t, i) => {
          const pct = t.pct ?? 0
          const h = (pct / max) * 130
          const overCap = cap > 0 && pct > cap
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] tabular-nums text-slate-400">{pct.toFixed(1)}%</span>
              <div
                className={`w-full max-w-[40px] rounded-t ${overCap ? 'bg-red-500' : 'bg-orange-500'}`}
                style={{ height: Math.max(2, h) }}
                title={`${t.label ?? t.period ?? ''}: ${pct.toFixed(1)}%`}
              />
              <span className="truncate text-[10px] text-slate-600">{t.period ?? t.label ?? i + 1}</span>
            </div>
          )
        })}
      </div>
      {cap > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2 w-4 rounded bg-red-500" /> over cap ({cap.toFixed(1)}%)
          <span className="ml-3 inline-block h-2 w-4 rounded bg-orange-500" /> within cap
        </div>
      )}
    </div>
  )
}

// ============== Line items ==============
function LineItemsTab({
  letterId,
  items,
  onChange,
  onErr,
}: {
  letterId: string
  items: LineItem[]
  onChange: (v: LineItem[]) => void
  onErr: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ sku: '', description: '', current: '', proposed: '', volume: '' })

  const totals = useMemo(() => {
    const current = items.reduce((a, i) => a + (i.current_price_cents ?? 0) * (i.annual_volume ?? 0), 0)
    const proposed = items.reduce((a, i) => a + (i.proposed_price_cents ?? 0) * (i.annual_volume ?? 0), 0)
    return { current, proposed, delta: proposed - current }
  }, [items])

  async function add() {
    if (!form.description.trim() && !form.sku.trim()) {
      onErr('Add a SKU or description')
      return
    }
    setSaving(true)
    try {
      const cur = form.current ? Math.round(parseFloat(form.current) * 100) : null
      const prop = form.proposed ? Math.round(parseFloat(form.proposed) * 100) : null
      const pct = cur && prop ? ((prop - cur) / cur) * 100 : null
      const res = await api.addLineItem(letterId, {
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        current_price_cents: cur,
        proposed_price_cents: prop,
        proposed_pct: pct,
        annual_volume: form.volume ? parseInt(form.volume, 10) : null,
      })
      const li = unwrap<LineItem>(res, 'line_item')
      onChange([...(li ? [li] : []), ...items])
      setOpen(false)
      setForm({ sku: '', description: '', current: '', proposed: '', volume: '' })
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to add line item')
    } finally {
      setSaving(false)
    }
  }

  async function remove(itemId: string) {
    if (!confirm('Delete this line item?')) return
    try {
      await api.deleteLineItem(letterId, itemId)
      onChange(items.filter((i) => i.id !== itemId))
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to delete line item')
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Line items</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          + Add line item
        </Button>
      </CardHeader>
      <CardBody className="p-0">
        {items.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="🧾" title="No line items" description="Break the increase down by SKU to model per-item impact." />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>SKU</TH>
                  <TH>Description</TH>
                  <TH className="text-right">Current</TH>
                  <TH className="text-right">Proposed</TH>
                  <TH className="text-right">Δ%</TH>
                  <TH className="text-right">Volume</TH>
                  <TH className="text-right">Annual Δ</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((i) => {
                  const delta =
                    ((i.proposed_price_cents ?? 0) - (i.current_price_cents ?? 0)) * (i.annual_volume ?? 0)
                  return (
                    <TR key={i.id}>
                      <TD className="font-mono text-xs">{i.sku ?? '—'}</TD>
                      <TD>{i.description ?? '—'}</TD>
                      <TD className="text-right tabular-nums">{money(i.current_price_cents)}</TD>
                      <TD className="text-right tabular-nums">{money(i.proposed_price_cents)}</TD>
                      <TD className="text-right tabular-nums text-orange-400">
                        {i.proposed_pct != null ? `${i.proposed_pct.toFixed(1)}%` : '—'}
                      </TD>
                      <TD className="text-right tabular-nums">{i.annual_volume?.toLocaleString() ?? '—'}</TD>
                      <TD className="text-right tabular-nums">{money(delta)}</TD>
                      <TD className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => remove(i.id)}>
                          Delete
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
            <div className="flex flex-wrap justify-end gap-6 border-t border-slate-800 px-4 py-3 text-sm">
              <span className="text-slate-500">
                Current annual: <span className="tabular-nums text-slate-300">{money(totals.current)}</span>
              </span>
              <span className="text-slate-500">
                Proposed annual: <span className="tabular-nums text-slate-300">{money(totals.proposed)}</span>
              </span>
              <span className="text-slate-500">
                Annual increase: <span className="tabular-nums text-orange-400">{money(totals.delta)}</span>
              </span>
            </div>
          </>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add line item"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={add} disabled={saving}>
              {saving ? 'Saving...' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FieldLite label="SKU">
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={inputCls} />
            </FieldLite>
            <FieldLite label="Annual volume">
              <input
                type="number"
                value={form.volume}
                onChange={(e) => setForm({ ...form, volume: e.target.value })}
                className={inputCls}
              />
            </FieldLite>
          </div>
          <FieldLite label="Description">
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputCls}
            />
          </FieldLite>
          <div className="grid grid-cols-2 gap-4">
            <FieldLite label="Current price (USD)">
              <input
                type="number"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                className={inputCls}
              />
            </FieldLite>
            <FieldLite label="Proposed price (USD)">
              <input
                type="number"
                value={form.proposed}
                onChange={(e) => setForm({ ...form, proposed: e.target.value })}
                className={inputCls}
              />
            </FieldLite>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

// ============== Scenarios ==============
function ScenariosTab({ scenarios, busy, onModel }: { scenarios: Scenario[]; busy: boolean; onModel: () => void }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Counter-offer scenarios</h2>
          <p className="text-xs text-slate-500">Model accept / capped / indexed / reject outcomes.</p>
        </div>
        <Button size="sm" onClick={onModel} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : 'Model scenarios'}
        </Button>
      </CardHeader>
      <CardBody className="p-0">
        {scenarios.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="🎯" title="No scenarios" description="Model scenarios to compare the financial impact of each counter-offer." />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border p-4 ${
                  s.is_recommended ? 'border-orange-700/70 bg-orange-950/20' : 'border-slate-800 bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{s.name || s.scenario_type}</h3>
                  {s.is_recommended && <Badge tone="orange">Recommended</Badge>}
                </div>
                {s.scenario_type && <div className="mt-1 text-xs text-slate-500">{s.scenario_type}</div>}
                <div className="mt-3 text-2xl font-bold tabular-nums text-white">
                  {s.applied_pct != null ? `${s.applied_pct.toFixed(1)}%` : '—'}
                </div>
                <div className="mt-1 text-sm text-orange-400 tabular-nums">{money(s.annual_impact_cents)} / yr</div>
                {s.detail && <p className="mt-2 text-xs text-slate-400">{s.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ============== Comments ==============
function CommentsTab({
  letterId,
  comments,
  onChange,
  onErr,
}: {
  letterId: string
  comments: Comment[]
  onChange: (v: Comment[]) => void
  onErr: (m: string) => void
}) {
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!body.trim()) return
    setSaving(true)
    try {
      const res = await api.addComment({ letter_id: letterId, author: author.trim() || 'You', body: body.trim() })
      const cm = unwrap<Comment>(res, 'comment')
      onChange([...comments, ...(cm ? [cm] : [])])
      setBody('')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to add comment')
    } finally {
      setSaving(false)
    }
  }

  async function remove(cid: string) {
    try {
      await api.deleteComment(cid)
      onChange(comments.filter((c) => c.id !== cid))
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to delete comment')
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-white">Discussion</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {comments.length === 0 ? (
          <EmptyState icon="💬" title="No comments" description="Leave notes for your negotiation team." />
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{c.author || 'Anonymous'}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-600">{fmtDate(c.created_at)}</span>
                    <button onClick={() => remove(c.id)} className="text-xs text-slate-600 hover:text-red-400">
                      delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className={inputCls}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment..."
            className={`${inputCls} min-h-[72px]`}
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={saving || !body.trim()}>
              {saving ? 'Posting...' : 'Post comment'}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

// ============== Documents ==============
function DocumentsTab({
  letterId,
  documents,
  onChange,
  onErr,
}: {
  letterId: string
  documents: DocumentRow[]
  onChange: (v: DocumentRow[]) => void
  onErr: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', doc_type: 'snippet', content: '', url: '' })

  async function add() {
    if (!form.name.trim()) {
      onErr('Document name is required')
      return
    }
    setSaving(true)
    try {
      const res = await api.createDocument({
        letter_id: letterId,
        name: form.name.trim(),
        doc_type: form.doc_type,
        content: form.content.trim() || null,
        url: form.url.trim() || null,
      })
      const doc = unwrap<DocumentRow>(res, 'document')
      onChange([...(doc ? [doc] : []), ...documents])
      setOpen(false)
      setForm({ name: '', doc_type: 'snippet', content: '', url: '' })
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to add document')
    } finally {
      setSaving(false)
    }
  }

  async function remove(docId: string) {
    if (!confirm('Delete this document?')) return
    try {
      await api.deleteDocument(docId)
      onChange(documents.filter((d) => d.id !== docId))
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to delete document')
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Documents &amp; snippets</h2>
          <p className="text-xs text-slate-500">Attach evidence, quotes, and supporting files.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          + Add document
        </Button>
      </CardHeader>
      <CardBody className="space-y-3">
        {documents.length === 0 ? (
          <EmptyState icon="📎" title="No documents" description="Attach snippets or links to back up your pushback." />
        ) : (
          documents.map((d) => (
            <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{d.name}</span>
                  {d.doc_type && <Badge tone="blue">{d.doc_type}</Badge>}
                </div>
                <button onClick={() => remove(d.id)} className="text-xs text-slate-600 hover:text-red-400">
                  delete
                </button>
              </div>
              {d.content && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{d.content}</p>}
              {d.url && (
                <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-orange-400 hover:underline">
                  {d.url}
                </a>
              )}
            </div>
          ))
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={add} disabled={saving}>
              {saving ? 'Saving...' : 'Add'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldLite label="Name" required>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
          </FieldLite>
          <FieldLite label="Type">
            <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className={inputCls}>
              <option value="snippet">snippet</option>
              <option value="evidence">evidence</option>
              <option value="contract">contract</option>
              <option value="email">email</option>
              <option value="other">other</option>
            </select>
          </FieldLite>
          <FieldLite label="Content">
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className={`${inputCls} min-h-[72px]`}
            />
          </FieldLite>
          <FieldLite label="URL">
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className={inputCls} placeholder="https://" />
          </FieldLite>
        </div>
      </Modal>
    </Card>
  )
}

// ============== Packet ==============
function PacketTab({ letterId, onErr, onOk }: { letterId: string; onErr: (m: string) => void; onOk: (m: string) => void }) {
  const [generating, setGenerating] = useState(false)
  const [tone, setTone] = useState('firm')
  const [packet, setPacket] = useState<{ id?: string; title?: string; tone?: string; recommended_counter_pct?: number | null; body?: string; status?: string } | null>(null)
  const [sections, setSections] = useState<{ id: string; heading?: string; content?: string; section_type?: string }[]>([])

  async function generate() {
    setGenerating(true)
    try {
      const res = await api.generatePacket({ letter_id: letterId, tone })
      const p = unwrap<typeof packet>(res, 'packet')
      setPacket(p)
      const secs = (res as Record<string, unknown>).sections
      setSections(asArray(secs))
      onOk('Pushback packet generated')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to generate packet')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Pushback packet</h2>
          <p className="text-xs text-slate-500">Generate a negotiation packet from checks, validations, and creep.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-600 focus:outline-none">
            <option value="firm">firm</option>
            <option value="collaborative">collaborative</option>
            <option value="formal">formal</option>
          </select>
          <Button size="sm" onClick={generate} disabled={generating}>
            {generating ? <Spinner className="h-4 w-4" /> : 'Generate packet'}
          </Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        {!packet ? (
          <EmptyState icon="📑" title="No packet yet" description="Generate a pushback packet, then refine it in the packet editor." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold text-white">{packet.title || 'Pushback packet'}</h3>
              {packet.tone && <Badge tone="blue">{packet.tone}</Badge>}
              {packet.status && <Badge tone={verdictTone(packet.status)}>{packet.status}</Badge>}
              {packet.recommended_counter_pct != null && (
                <span className="text-sm text-slate-400">
                  recommended counter <span className="font-medium text-orange-400">{packet.recommended_counter_pct.toFixed(1)}%</span>
                </span>
              )}
            </div>
            {packet.body && <p className="whitespace-pre-wrap text-sm text-slate-300">{packet.body}</p>}
            {sections.length > 0 && (
              <div className="space-y-3">
                {sections.map((s) => (
                  <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{s.heading || s.section_type}</span>
                      {s.section_type && <Badge tone="neutral">{s.section_type}</Badge>}
                    </div>
                    {s.content && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">{s.content}</p>}
                  </div>
                ))}
              </div>
            )}
            {packet.id && (
              <Link href={`/dashboard/packets/${packet.id}`}>
                <Button variant="secondary" size="sm">
                  Open in packet editor →
                </Button>
              </Link>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

// ============== Approval button + modal ==============
function ApprovalButton({ letterId, onDone, onErr }: { letterId: string; onDone: (m: string) => void; onErr: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function create() {
    setSaving(true)
    try {
      await api.createApproval({ letter_id: letterId, decision_note: note.trim() || null })
      await api
        .recordAudit({ entity_type: 'letter', entity_id: letterId, action: 'approval_requested', detail: { note } })
        .catch(() => {})
      onDone('Approval requested')
      setOpen(false)
      setNote('')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Failed to create approval')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Request approval</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request approval"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Route this letter through your approval chain before accepting or contesting the increase.
          </p>
          <FieldLite label="Decision note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputCls} min-h-[72px]`}
              placeholder="Context for approvers..."
            />
          </FieldLite>
        </div>
      </Modal>
    </>
  )
}

// ---------- shared ----------
const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-600 focus:outline-none'

function FieldLite({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ml-1 text-orange-500">*</span>}
      </span>
      {children}
    </label>
  )
}
