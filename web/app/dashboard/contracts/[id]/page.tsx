'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
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
}

interface Clause {
  id: string
  contract_id: string
  clause_type: string
  title: string | null
  citation_text: string | null
  cap_pct: number | null
  cumulative_cap_pct: number | null
  notice_days: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  index_id: string | null
  index_basket: unknown
  config: unknown
  created_at: string
}

interface IndexRow {
  id: string
  code: string
  name: string
}

interface CreepRecord {
  id: string
  contract_id: string
  letter_id: string | null
  cumulative_pct: number | null
  cap_pct: number | null
  breached: boolean | null
  timeline: TimelinePoint[] | null
  created_at: string
}

interface TimelinePoint {
  period?: string
  date?: string
  label?: string
  pct?: number
  cumulative_pct?: number
}

interface DocRow {
  id: string
  name: string
  doc_type: string | null
  content: string | null
  url: string | null
  created_at: string
}

const CLAUSE_TYPES = [
  { value: 'price_cap', label: 'Price Cap (annual %)' },
  { value: 'cumulative_cap', label: 'Cumulative Cap' },
  { value: 'index_linked', label: 'Index-Linked Escalation' },
  { value: 'fixed_price', label: 'Fixed Price Window' },
  { value: 'notice', label: 'Notice Requirement' },
  { value: 'most_favored', label: 'Most-Favored Customer' },
  { value: 'audit', label: 'Audit Rights' },
  { value: 'other', label: 'Other' },
]

const DOC_TYPES = ['contract_pdf', 'amendment', 'side_letter', 'snippet', 'evidence', 'other']

function clauseLabel(t: string) {
  return CLAUSE_TYPES.find((c) => c.value === t)?.label ?? t
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function pct(v?: number | null) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(2)}%`
}

const emptyClause = {
  clause_type: 'price_cap',
  title: '',
  citation_text: '',
  cap_pct: '',
  cumulative_cap_pct: '',
  notice_days: '',
  fixed_start_date: '',
  fixed_end_date: '',
  index_id: '',
}

type ClauseForm = typeof emptyClause

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id

  const [contract, setContract] = useState<Contract | null>(null)
  const [clauses, setClauses] = useState<Clause[]>([])
  const [indices, setIndices] = useState<IndexRow[]>([])
  const [creep, setCreep] = useState<CreepRecord[]>([])
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clauseModal, setClauseModal] = useState(false)
  const [editingClause, setEditingClause] = useState<Clause | null>(null)
  const [clauseForm, setClauseForm] = useState<ClauseForm>(emptyClause)
  const [clauseSaving, setClauseSaving] = useState(false)
  const [clauseErr, setClauseErr] = useState<string | null>(null)

  const [computing, setComputing] = useState(false)
  const [computeErr, setComputeErr] = useState<string | null>(null)

  const [docModal, setDocModal] = useState(false)
  const [docForm, setDocForm] = useState({ name: '', doc_type: 'snippet', content: '', url: '' })
  const [docSaving, setDocSaving] = useState(false)
  const [docErr, setDocErr] = useState<string | null>(null)

  const indexName = useMemo(() => {
    const m = new Map<string, string>()
    indices.forEach((i) => m.set(i.id, `${i.code} · ${i.name}`))
    return m
  }, [indices])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const detail = await api.getContract(id)
      const c: Contract | null = detail?.contract ?? detail ?? null
      setContract(c)
      const inlineClauses: Clause[] | undefined = detail?.clauses
      const [cl, idx, cr, dc] = await Promise.all([
        inlineClauses ? Promise.resolve(inlineClauses) : api.getClauses(id),
        api.getIndices(),
        api.getCreep(id),
        api.getDocuments({ contract_id: id }),
      ])
      setClauses(Array.isArray(cl) ? cl : [])
      setIndices(Array.isArray(idx) ? idx : [])
      setCreep(Array.isArray(cr) ? cr : [])
      setDocs(Array.isArray(dc) ? dc : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contract')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function openNewClause() {
    setEditingClause(null)
    setClauseForm(emptyClause)
    setClauseErr(null)
    setClauseModal(true)
  }

  function openEditClause(c: Clause) {
    setEditingClause(c)
    setClauseForm({
      clause_type: c.clause_type,
      title: c.title ?? '',
      citation_text: c.citation_text ?? '',
      cap_pct: c.cap_pct != null ? String(c.cap_pct) : '',
      cumulative_cap_pct: c.cumulative_cap_pct != null ? String(c.cumulative_cap_pct) : '',
      notice_days: c.notice_days != null ? String(c.notice_days) : '',
      fixed_start_date: c.fixed_start_date ?? '',
      fixed_end_date: c.fixed_end_date ?? '',
      index_id: c.index_id ?? '',
    })
    setClauseErr(null)
    setClauseModal(true)
  }

  async function saveClause() {
    setClauseSaving(true)
    setClauseErr(null)
    try {
      const body: Record<string, unknown> = {
        contract_id: id,
        clause_type: clauseForm.clause_type,
      }
      if (clauseForm.title.trim()) body.title = clauseForm.title.trim()
      if (clauseForm.citation_text.trim()) body.citation_text = clauseForm.citation_text.trim()
      if (clauseForm.cap_pct !== '') body.cap_pct = Number(clauseForm.cap_pct)
      if (clauseForm.cumulative_cap_pct !== '') body.cumulative_cap_pct = Number(clauseForm.cumulative_cap_pct)
      if (clauseForm.notice_days !== '') body.notice_days = Number(clauseForm.notice_days)
      if (clauseForm.fixed_start_date) body.fixed_start_date = clauseForm.fixed_start_date
      if (clauseForm.fixed_end_date) body.fixed_end_date = clauseForm.fixed_end_date
      if (clauseForm.index_id) body.index_id = clauseForm.index_id
      if (editingClause) {
        await api.updateClause(editingClause.id, body)
      } else {
        await api.createClause(body)
      }
      setClauseModal(false)
      await load()
    } catch (e) {
      setClauseErr(e instanceof Error ? e.message : 'Failed to save clause')
    } finally {
      setClauseSaving(false)
    }
  }

  async function removeClause(c: Clause) {
    if (!window.confirm(`Delete clause "${c.title || clauseLabel(c.clause_type)}"?`)) return
    try {
      await api.deleteClause(c.id)
      setClauses((prev) => prev.filter((x) => x.id !== c.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete clause')
    }
  }

  async function runCompute() {
    setComputing(true)
    setComputeErr(null)
    try {
      await api.computeCreep(id)
      const cr = await api.getCreep(id)
      setCreep(Array.isArray(cr) ? cr : [])
    } catch (e) {
      setComputeErr(e instanceof Error ? e.message : 'Failed to compute creep')
    } finally {
      setComputing(false)
    }
  }

  async function saveDoc() {
    if (!docForm.name.trim()) {
      setDocErr('Name is required')
      return
    }
    setDocSaving(true)
    setDocErr(null)
    try {
      const body: Record<string, unknown> = {
        contract_id: id,
        name: docForm.name.trim(),
        doc_type: docForm.doc_type,
      }
      if (docForm.content.trim()) body.content = docForm.content.trim()
      if (docForm.url.trim()) body.url = docForm.url.trim()
      await api.createDocument(body)
      setDocModal(false)
      setDocForm({ name: '', doc_type: 'snippet', content: '', url: '' })
      const dc = await api.getDocuments({ contract_id: id })
      setDocs(Array.isArray(dc) ? dc : [])
    } catch (e) {
      setDocErr(e instanceof Error ? e.message : 'Failed to save document')
    } finally {
      setDocSaving(false)
    }
  }

  const latestCreep = creep.length > 0 ? creep[0] : null
  const field = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none'
  const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500'

  if (loading) return <PageSpinner label="Loading contract…" />

  if (error || !contract) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/contracts" className="text-sm text-neutral-400 hover:text-red-400">← Back to contracts</Link>
        <Card>
          <CardBody className="flex items-center justify-between">
            <span className="text-sm text-red-300">{error || 'Contract not found'}</span>
            <Button variant="secondary" size="sm" onClick={load}>Retry</Button>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Build timeline points for the SVG chart from the latest creep record.
  const timeline: TimelinePoint[] = Array.isArray(latestCreep?.timeline) ? (latestCreep!.timeline as TimelinePoint[]) : []

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/contracts" className="text-sm text-neutral-400 hover:text-red-400">← Back to contracts</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{contract.name}</h1>
            <Badge tone={verdictTone(contract.status ?? 'neutral')}>{contract.status || 'unknown'}</Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {contract.governing_entity || 'No governing entity'} · {contract.currency || 'USD'} · v{contract.version ?? 1}
            {contract.reference_number ? ` · ${contract.reference_number}` : ''}
          </p>
        </div>
        <Button onClick={openNewClause}>+ Add Clause</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Clauses" value={clauses.length} />
        <Stat label="Effective" value={fmtDate(contract.effective_date)} />
        <Stat label="Term End" value={fmtDate(contract.term_end_date)} />
        <Stat
          label="Cumulative Creep"
          value={latestCreep ? pct(latestCreep.cumulative_pct) : '—'}
          tone={latestCreep?.breached ? 'red' : latestCreep ? 'green' : 'default'}
          hint={latestCreep ? `Cap ${pct(latestCreep.cap_pct)}` : 'Not computed'}
        />
      </div>

      {contract.notes && (
        <Card>
          <CardBody>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{contract.notes}</p>
          </CardBody>
        </Card>
      )}

      {/* Clause editor */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Clauses</h2>
          <Button variant="secondary" size="sm" onClick={openNewClause}>+ Add</Button>
        </CardHeader>
        <CardBody>
          {clauses.length === 0 ? (
            <EmptyState
              icon="⚖️"
              title="No clauses captured"
              description="Add the escalation caps, index links, and notice terms so the desk can score increases against them."
              action={<Button size="sm" onClick={openNewClause}>+ Add Clause</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Type / Title</TH>
                  <TH>Cap</TH>
                  <TH>Cumulative</TH>
                  <TH>Notice</TH>
                  <TH>Index / Window</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {clauses.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="font-medium text-neutral-100">{c.title || clauseLabel(c.clause_type)}</div>
                      <div className="text-xs text-neutral-500">{clauseLabel(c.clause_type)}</div>
                      {c.citation_text && (
                        <div className="mt-1 max-w-md truncate text-xs italic text-neutral-600" title={c.citation_text}>
                          “{c.citation_text}”
                        </div>
                      )}
                    </TD>
                    <TD>{pct(c.cap_pct)}</TD>
                    <TD>{pct(c.cumulative_cap_pct)}</TD>
                    <TD>{c.notice_days != null ? `${c.notice_days}d` : '—'}</TD>
                    <TD className="text-xs">
                      {c.index_id ? (
                        <span className="text-sky-300">{indexName.get(c.index_id) ?? 'Linked index'}</span>
                      ) : c.fixed_start_date || c.fixed_end_date ? (
                        <span>{fmtDate(c.fixed_start_date)} → {fmtDate(c.fixed_end_date)}</span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEditClause(c)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => removeClause(c)}>Delete</Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Creep timeline */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">Cumulative Creep Timeline</h2>
            <p className="text-xs text-neutral-500">Stacked price increases across this contract&apos;s letters vs. the cumulative cap.</p>
          </div>
          <Button size="sm" onClick={runCompute} disabled={computing}>
            {computing ? 'Computing…' : 'Recompute Creep'}
          </Button>
        </CardHeader>
        <CardBody>
          {computeErr && (
            <div className="mb-3 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{computeErr}</div>
          )}
          {!latestCreep ? (
            <EmptyState
              icon="📈"
              title="No creep computed yet"
              description="Run the cumulative-creep engine to stack every accepted increase against the contract cap."
              action={<Button size="sm" onClick={runCompute} disabled={computing}>{computing ? 'Computing…' : 'Compute Creep'}</Button>}
            />
          ) : (
            <CreepChart timeline={timeline} cumulative={Number(latestCreep.cumulative_pct ?? 0)} cap={latestCreep.cap_pct != null ? Number(latestCreep.cap_pct) : null} breached={!!latestCreep.breached} />
          )}

          {creep.length > 1 && (
            <div className="mt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Compute History</div>
              <Table>
                <THead>
                  <TR>
                    <TH>Computed</TH>
                    <TH>Cumulative</TH>
                    <TH>Cap</TH>
                    <TH>Verdict</TH>
                  </TR>
                </THead>
                <TBody>
                  {creep.map((r) => (
                    <TR key={r.id}>
                      <TD>{fmtDate(r.created_at)}</TD>
                      <TD>{pct(r.cumulative_pct)}</TD>
                      <TD>{pct(r.cap_pct)}</TD>
                      <TD>
                        <Badge tone={r.breached ? 'red' : 'green'}>{r.breached ? 'Breached' : 'Within cap'}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Documents / snippets */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Documents &amp; Snippets</h2>
          <Button variant="secondary" size="sm" onClick={() => { setDocForm({ name: '', doc_type: 'snippet', content: '', url: '' }); setDocErr(null); setDocModal(true) }}>+ Add</Button>
        </CardHeader>
        <CardBody>
          {docs.length === 0 ? (
            <EmptyState icon="📎" title="No documents attached" description="Attach the executed PDF, amendments, or clause snippets used as negotiation evidence." />
          ) : (
            <div className="space-y-3">
              {docs.map((d) => (
                <div key={d.id} className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-100">{d.name}</span>
                        <Badge tone="neutral">{d.doc_type || 'doc'}</Badge>
                      </div>
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">{d.url}</a>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-neutral-600">{fmtDate(d.created_at)}</span>
                  </div>
                  {d.content && <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-400">{d.content}</p>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Clause modal */}
      <Modal
        open={clauseModal}
        onClose={() => setClauseModal(false)}
        title={editingClause ? 'Edit Clause' : 'Add Clause'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClauseModal(false)} disabled={clauseSaving}>Cancel</Button>
            <Button onClick={saveClause} disabled={clauseSaving}>{clauseSaving ? 'Saving…' : editingClause ? 'Save Clause' : 'Add Clause'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {clauseErr && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{clauseErr}</div>
          )}
          <div>
            <label className={label}>Clause Type</label>
            <select className={field} value={clauseForm.clause_type} onChange={(e) => setClauseForm({ ...clauseForm, clause_type: e.target.value })}>
              {CLAUSE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Title</label>
            <input className={field} value={clauseForm.title} onChange={(e) => setClauseForm({ ...clauseForm, title: e.target.value })} placeholder="Section 7.2 — Annual Escalation" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={label}>Cap %</label>
              <input type="number" step="0.01" className={field} value={clauseForm.cap_pct} onChange={(e) => setClauseForm({ ...clauseForm, cap_pct: e.target.value })} placeholder="3" />
            </div>
            <div>
              <label className={label}>Cumulative Cap %</label>
              <input type="number" step="0.01" className={field} value={clauseForm.cumulative_cap_pct} onChange={(e) => setClauseForm({ ...clauseForm, cumulative_cap_pct: e.target.value })} placeholder="10" />
            </div>
            <div>
              <label className={label}>Notice Days</label>
              <input type="number" className={field} value={clauseForm.notice_days} onChange={(e) => setClauseForm({ ...clauseForm, notice_days: e.target.value })} placeholder="90" />
            </div>
          </div>
          <div>
            <label className={label}>Linked Index</label>
            <select className={field} value={clauseForm.index_id} onChange={(e) => setClauseForm({ ...clauseForm, index_id: e.target.value })}>
              <option value="">— None —</option>
              {indices.map((i) => (
                <option key={i.id} value={i.id}>{i.code} · {i.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Fixed Window Start</label>
              <input type="date" className={field} value={clauseForm.fixed_start_date} onChange={(e) => setClauseForm({ ...clauseForm, fixed_start_date: e.target.value })} />
            </div>
            <div>
              <label className={label}>Fixed Window End</label>
              <input type="date" className={field} value={clauseForm.fixed_end_date} onChange={(e) => setClauseForm({ ...clauseForm, fixed_end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Citation Text</label>
            <textarea className={`${field} min-h-[80px]`} value={clauseForm.citation_text} onChange={(e) => setClauseForm({ ...clauseForm, citation_text: e.target.value })} placeholder="Paste the exact contract language to cite in pushback packets…" />
          </div>
        </div>
      </Modal>

      {/* Document modal */}
      <Modal
        open={docModal}
        onClose={() => setDocModal(false)}
        title="Add Document / Snippet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDocModal(false)} disabled={docSaving}>Cancel</Button>
            <Button onClick={saveDoc} disabled={docSaving}>{docSaving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {docErr && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{docErr}</div>
          )}
          <div>
            <label className={label}>Name *</label>
            <input className={field} value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} placeholder="Executed MSA — clean copy" />
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={field} value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>URL</label>
            <input className={field} value={docForm.url} onChange={(e) => setDocForm({ ...docForm, url: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <label className={label}>Content / Snippet</label>
            <textarea className={`${field} min-h-[100px]`} value={docForm.content} onChange={(e) => setDocForm({ ...docForm, content: e.target.value })} placeholder="Paste clause text or notes…" />
          </div>
        </div>
      </Modal>

      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!window.confirm(`Delete contract "${contract.name}" and all its clauses? This cannot be undone.`)) return
            try {
              await api.deleteContract(id)
              router.push('/dashboard/contracts')
            } catch (e) {
              window.alert(e instanceof Error ? e.message : 'Failed to delete contract')
            }
          }}
          className="text-red-400 hover:text-red-300"
        >
          Delete this contract
        </Button>
      </div>
    </div>
  )
}

function CreepChart({
  timeline,
  cumulative,
  cap,
  breached,
}: {
  timeline: TimelinePoint[]
  cumulative: number
  cap: number | null
  breached: boolean
}) {
  // Normalize timeline into ascending cumulative steps.
  const points = timeline.map((p, i) => {
    const cum = p.cumulative_pct != null ? Number(p.cumulative_pct) : undefined
    return {
      label: p.label || p.period || p.date || `Step ${i + 1}`,
      pct: p.pct != null ? Number(p.pct) : undefined,
      cumulative: cum,
    }
  })

  // If no per-step cumulative is provided, synthesize a running total from pct steps.
  let running = 0
  const series = points.map((p) => {
    if (p.cumulative != null) {
      running = p.cumulative
    } else if (p.pct != null) {
      running += p.pct
    }
    return { ...p, value: p.cumulative != null ? p.cumulative : running }
  })

  const maxBar = Math.max(cumulative, cap ?? 0, ...series.map((s) => s.value), 1)
  const scale = (v: number) => `${Math.min(100, (v / maxBar) * 100)}%`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Cumulative</div>
          <div className={`text-3xl font-bold tabular-nums ${breached ? 'text-red-400' : 'text-emerald-400'}`}>
            {cumulative.toFixed(2)}%
          </div>
        </div>
        {cap != null && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Contract Cap</div>
            <div className="text-3xl font-bold tabular-nums text-neutral-300">{cap.toFixed(2)}%</div>
          </div>
        )}
        <Badge tone={breached ? 'red' : 'green'}>{breached ? 'Cap breached' : 'Within cap'}</Badge>
      </div>

      {/* Cumulative-vs-cap bar */}
      <div>
        <div className="relative h-7 w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          <div
            className={`absolute inset-y-0 left-0 ${breached ? 'bg-red-600/70' : 'bg-red-600/70'}`}
            style={{ width: scale(cumulative) }}
          />
          {cap != null && (
            <div className="absolute inset-y-0 w-0.5 bg-emerald-400" style={{ left: scale(cap) }} title={`Cap ${cap}%`} />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-neutral-600">
          <span>0%</span>
          <span>{maxBar.toFixed(1)}%</span>
        </div>
      </div>

      {/* Step timeline */}
      {series.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Increase Steps</div>
          <div className="flex items-end gap-2 overflow-x-auto pb-2">
            {series.map((s, i) => {
              const overCap = cap != null && s.value > cap
              const h = Math.max(6, Math.min(100, (s.value / maxBar) * 100))
              return (
                <div key={i} className="flex min-w-[56px] flex-col items-center">
                  <span className="mb-1 text-[11px] tabular-nums text-neutral-400">{s.value.toFixed(1)}%</span>
                  <div className="flex h-28 w-full items-end rounded bg-neutral-950/60">
                    <div
                      className={`w-full rounded-t ${overCap ? 'bg-red-500/70' : 'bg-red-500/60'}`}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  <span className="mt-1 max-w-[56px] truncate text-[11px] text-neutral-500" title={s.label}>{s.label}</span>
                  {s.pct != null && <span className="text-[10px] text-neutral-600">+{s.pct.toFixed(1)}%</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
