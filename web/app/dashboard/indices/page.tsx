'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface IndexRow {
  id: string
  code: string
  name: string
  source: string | null
  unit: string | null
  description: string | null
  created_at: string
}

interface DataPoint {
  id: string
  index_id: string
  period: string
  value: number
  created_at: string
}

const SOURCES = ['BLS', 'Eurostat', 'ONS', 'Custom', 'Vendor', 'Other']

const emptyIndex = { code: '', name: '', source: 'BLS', unit: 'index', description: '' }
type IndexForm = typeof emptyIndex

function periodSort(a: string, b: string) {
  return a.localeCompare(b)
}

export default function IndicesPage() {
  const [indices, setIndices] = useState<IndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  const [indexModal, setIndexModal] = useState(false)
  const [editingIndex, setEditingIndex] = useState<IndexRow | null>(null)
  const [indexForm, setIndexForm] = useState<IndexForm>(emptyIndex)
  const [indexSaving, setIndexSaving] = useState(false)
  const [indexErr, setIndexErr] = useState<string | null>(null)

  const [pointPeriod, setPointPeriod] = useState('')
  const [pointValue, setPointValue] = useState('')
  const [pointSaving, setPointSaving] = useState(false)
  const [pointErr, setPointErr] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importSaving, setImportSaving] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)

  const selected = useMemo(() => indices.find((i) => i.id === selectedId) ?? null, [indices, selectedId])

  async function loadIndices(keepSelection = true) {
    setLoading(true)
    setError(null)
    try {
      const idx = await api.getIndices()
      const list: IndexRow[] = Array.isArray(idx) ? idx : []
      setIndices(list)
      if (list.length > 0 && (!keepSelection || !list.some((i) => i.id === selectedId))) {
        setSelectedId(list[0].id)
      } else if (list.length === 0) {
        setSelectedId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load indices')
    } finally {
      setLoading(false)
    }
  }

  async function loadData(indexId: string) {
    setDataLoading(true)
    setDataError(null)
    try {
      const dp = await api.getIndexData(indexId)
      const list: DataPoint[] = Array.isArray(dp) ? dp : []
      list.sort((a, b) => periodSort(a.period, b.period))
      setDataPoints(list)
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Failed to load data points')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    loadIndices(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedId) loadData(selectedId)
    else setDataPoints([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return indices
    return indices.filter((i) =>
      `${i.code} ${i.name} ${i.source ?? ''} ${i.description ?? ''}`.toLowerCase().includes(q),
    )
  }, [indices, search])

  function openNewIndex() {
    setEditingIndex(null)
    setIndexForm(emptyIndex)
    setIndexErr(null)
    setIndexModal(true)
  }

  function openEditIndex(i: IndexRow) {
    setEditingIndex(i)
    setIndexForm({
      code: i.code,
      name: i.name,
      source: i.source ?? 'Custom',
      unit: i.unit ?? 'index',
      description: i.description ?? '',
    })
    setIndexErr(null)
    setIndexModal(true)
  }

  async function saveIndex() {
    if (!indexForm.code.trim() || !indexForm.name.trim()) {
      setIndexErr('Code and name are required')
      return
    }
    setIndexSaving(true)
    setIndexErr(null)
    try {
      const body: Record<string, unknown> = {
        code: indexForm.code.trim(),
        name: indexForm.name.trim(),
        source: indexForm.source,
        unit: indexForm.unit.trim() || 'index',
      }
      if (indexForm.description.trim()) body.description = indexForm.description.trim()
      if (editingIndex) {
        await api.updateIndex(editingIndex.id, body)
      } else {
        const created = await api.createIndex(body)
        const newId = created?.index?.id ?? created?.id
        if (newId) setSelectedId(newId)
      }
      setIndexModal(false)
      await loadIndices()
    } catch (e) {
      setIndexErr(e instanceof Error ? e.message : 'Failed to save index')
    } finally {
      setIndexSaving(false)
    }
  }

  async function removeIndex(i: IndexRow) {
    if (!window.confirm(`Delete index "${i.code}" and all its data points?`)) return
    try {
      await api.deleteIndex(i.id)
      if (selectedId === i.id) setSelectedId(null)
      await loadIndices(false)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete index')
    }
  }

  async function addPoint() {
    if (!selectedId) return
    if (!pointPeriod.trim() || pointValue === '') {
      setPointErr('Period and value are required')
      return
    }
    setPointSaving(true)
    setPointErr(null)
    try {
      await api.addIndexData({ index_id: selectedId, period: pointPeriod.trim(), value: Number(pointValue) })
      setPointPeriod('')
      setPointValue('')
      await loadData(selectedId)
    } catch (e) {
      setPointErr(e instanceof Error ? e.message : 'Failed to add data point')
    } finally {
      setPointSaving(false)
    }
  }

  async function removePoint(p: DataPoint) {
    try {
      await api.deleteIndexData(p.id)
      setDataPoints((prev) => prev.filter((x) => x.id !== p.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to delete point')
    }
  }

  async function runImport() {
    if (!selectedId) return
    // Parse "period,value" lines (CSV or whitespace).
    const points: { period: string; value: number }[] = []
    for (const raw of importText.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const parts = line.split(/[\s,;\t]+/).filter(Boolean)
      if (parts.length < 2) continue
      const value = Number(parts[parts.length - 1])
      const period = parts.slice(0, parts.length - 1).join(' ')
      if (!period || Number.isNaN(value)) continue
      points.push({ period, value })
    }
    if (points.length === 0) {
      setImportErr('No valid "period, value" rows found')
      return
    }
    setImportSaving(true)
    setImportErr(null)
    try {
      await api.importIndexData({ index_id: selectedId, points })
      setImportOpen(false)
      setImportText('')
      await loadData(selectedId)
    } catch (e) {
      setImportErr(e instanceof Error ? e.message : 'Failed to import data')
    } finally {
      setImportSaving(false)
    }
  }

  // Derived stats for selected index.
  const dataStats = useMemo(() => {
    if (dataPoints.length === 0) return null
    const first = dataPoints[0]
    const last = dataPoints[dataPoints.length - 1]
    const changePct = first.value !== 0 ? ((last.value - first.value) / first.value) * 100 : 0
    return { count: dataPoints.length, first, last, changePct }
  }, [dataPoints])

  const field = 'w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-red-500 focus:outline-none'
  const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Index Library</h1>
          <p className="mt-1 text-sm text-neutral-500">
            PPI, CPI, and bespoke cost indices used to validate every &quot;our costs went up&quot; claim.
          </p>
        </div>
        <Button onClick={openNewIndex}>+ New Index</Button>
      </div>

      {loading ? (
        <PageSpinner label="Loading indices…" />
      ) : error ? (
        <Card>
          <CardBody className="flex items-center justify-between">
            <span className="text-sm text-red-300">{error}</span>
            <Button variant="secondary" size="sm" onClick={() => loadIndices(false)}>Retry</Button>
          </CardBody>
        </Card>
      ) : indices.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No indices yet"
          description="Add the cost indices suppliers cite, then load their data points to check claimed escalations."
          action={<Button onClick={openNewIndex}>+ New Index</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Index list */}
          <div className="space-y-3">
            <input
              className={field}
              placeholder="Search indices…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="px-1 text-sm text-neutral-500">No indices match.</p>
              ) : (
                filtered.map((i) => {
                  const active = i.id === selectedId
                  return (
                    <button
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-red-600/70 bg-red-950/30'
                          : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-red-300">{i.code}</span>
                        {i.source && <Badge tone="blue">{i.source}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-neutral-200">{i.name}</div>
                      {i.unit && <div className="text-xs text-neutral-500">unit: {i.unit}</div>}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Selected index detail + data points */}
          <div className="space-y-4">
            {!selected ? (
              <EmptyState icon="👈" title="Select an index" description="Pick an index on the left to manage its data points." />
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-red-300">{selected.code}</span>
                        {selected.source && <Badge tone="blue">{selected.source}</Badge>}
                      </div>
                      <h2 className="mt-0.5 text-base font-semibold text-white">{selected.name}</h2>
                      {selected.description && <p className="mt-1 max-w-xl text-sm text-neutral-500">{selected.description}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditIndex(selected)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => removeIndex(selected)}>Delete</Button>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                      <Stat label="Data Points" value={dataStats?.count ?? 0} />
                      <Stat label="Earliest" value={dataStats ? dataStats.first.period : '—'} hint={dataStats ? String(dataStats.first.value) : undefined} />
                      <Stat label="Latest" value={dataStats ? dataStats.last.period : '—'} hint={dataStats ? String(dataStats.last.value) : undefined} />
                      <Stat
                        label="Total Change"
                        value={dataStats ? `${dataStats.changePct >= 0 ? '+' : ''}${dataStats.changePct.toFixed(2)}%` : '—'}
                        tone={dataStats ? (dataStats.changePct >= 0 ? 'orange' : 'green') : 'default'}
                      />
                    </div>
                  </CardBody>
                </Card>

                {/* Trend chart */}
                {dataPoints.length > 1 && <IndexTrend points={dataPoints} unit={selected.unit ?? ''} />}

                {/* Add point + import */}
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Data Points</h3>
                    <Button variant="secondary" size="sm" onClick={() => { setImportText(''); setImportErr(null); setImportOpen(true) }}>
                      Bulk Import
                    </Button>
                  </CardHeader>
                  <CardBody>
                    <div className="mb-4 flex flex-wrap items-end gap-3">
                      <div>
                        <label className={label}>Period</label>
                        <input className={`${field} w-40`} value={pointPeriod} onChange={(e) => setPointPeriod(e.target.value)} placeholder="2024-Q1 or 2024-03" />
                      </div>
                      <div>
                        <label className={label}>Value</label>
                        <input type="number" step="any" className={`${field} w-32`} value={pointValue} onChange={(e) => setPointValue(e.target.value)} placeholder="142.7" />
                      </div>
                      <Button onClick={addPoint} disabled={pointSaving}>{pointSaving ? 'Adding…' : '+ Add Point'}</Button>
                      {pointErr && <span className="text-xs text-red-300">{pointErr}</span>}
                    </div>

                    {dataLoading ? (
                      <PageSpinner label="Loading data points…" />
                    ) : dataError ? (
                      <div className="flex items-center justify-between rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2">
                        <span className="text-sm text-red-300">{dataError}</span>
                        <Button variant="secondary" size="sm" onClick={() => selectedId && loadData(selectedId)}>Retry</Button>
                      </div>
                    ) : dataPoints.length === 0 ? (
                      <EmptyState icon="🗓️" title="No data points" description="Add periods one at a time or paste a CSV via Bulk Import." />
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Period</TH>
                            <TH>Value</TH>
                            <TH>Period-over-Period</TH>
                            <TH className="text-right">Actions</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {dataPoints.map((p, i) => {
                            const prev = i > 0 ? dataPoints[i - 1] : null
                            const pop = prev && prev.value !== 0 ? ((p.value - prev.value) / prev.value) * 100 : null
                            return (
                              <TR key={p.id}>
                                <TD className="font-mono text-neutral-200">{p.period}</TD>
                                <TD className="tabular-nums">{p.value}</TD>
                                <TD>
                                  {pop === null ? (
                                    <span className="text-neutral-600">—</span>
                                  ) : (
                                    <span className={pop >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                      {pop >= 0 ? '+' : ''}{pop.toFixed(2)}%
                                    </span>
                                  )}
                                </TD>
                                <TD className="text-right">
                                  <Button variant="danger" size="sm" onClick={() => removePoint(p)}>Delete</Button>
                                </TD>
                              </TR>
                            )
                          })}
                        </TBody>
                      </Table>
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Index modal */}
      <Modal
        open={indexModal}
        onClose={() => setIndexModal(false)}
        title={editingIndex ? 'Edit Index' : 'New Index'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIndexModal(false)} disabled={indexSaving}>Cancel</Button>
            <Button onClick={saveIndex} disabled={indexSaving}>{indexSaving ? 'Saving…' : editingIndex ? 'Save' : 'Create Index'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {indexErr && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{indexErr}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Code *</label>
              <input className={field} value={indexForm.code} onChange={(e) => setIndexForm({ ...indexForm, code: e.target.value })} placeholder="PPI-3211" />
            </div>
            <div>
              <label className={label}>Source</label>
              <select className={field} value={indexForm.source} onChange={(e) => setIndexForm({ ...indexForm, source: e.target.value })}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={field} value={indexForm.name} onChange={(e) => setIndexForm({ ...indexForm, name: e.target.value })} placeholder="PPI: Corrugated & Solid Fiber Boxes" />
          </div>
          <div>
            <label className={label}>Unit</label>
            <input className={field} value={indexForm.unit} onChange={(e) => setIndexForm({ ...indexForm, unit: e.target.value })} placeholder="index / USD / EUR" />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea className={`${field} min-h-[72px]`} value={indexForm.description} onChange={(e) => setIndexForm({ ...indexForm, description: e.target.value })} placeholder="What this index measures and how suppliers cite it…" />
          </div>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Bulk Import Data Points"
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importSaving}>Cancel</Button>
            <Button onClick={runImport} disabled={importSaving}>{importSaving ? 'Importing…' : 'Import'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {importErr && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{importErr}</div>
          )}
          <p className="text-sm text-neutral-400">
            Paste one row per line as <code className="rounded bg-neutral-800 px-1 text-red-300">period, value</code>. Commas, spaces, tabs, or semicolons all work. Existing periods are upserted.
          </p>
          <textarea
            className={`${field} min-h-[200px] font-mono`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'2023-Q1, 138.2\n2023-Q2, 140.1\n2023-Q3, 141.9\n2023-Q4, 143.4'}
          />
        </div>
      </Modal>
    </div>
  )
}

function IndexTrend({ points, unit }: { points: DataPoint[]; unit: string }) {
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const W = 760
  const H = 200
  const padX = 8
  const padY = 16
  const innerW = W - padX * 2
  const innerH = H - padY * 2

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = padY + innerH - ((p.value - min) / span) * innerH
    return { x, y, p }
  })

  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${padX},${padY + innerH} ${line} ${(padX + innerW).toFixed(1)},${(padY + innerH).toFixed(1)}`

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Trend</h3>
        <span className="text-xs text-neutral-500">{points.length} points{unit ? ` · ${unit}` : ''}</span>
      </CardHeader>
      <CardBody>
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="min-w-[480px]">
            <defs>
              <linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(234 88 12)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(234 88 12)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={area} fill="url(#indexFill)" />
            <polyline points={line} fill="none" stroke="rgb(249 115 22)" strokeWidth="2" />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r="2.5" fill="rgb(249 115 22)">
                <title>{`${c.p.period}: ${c.p.value}`}</title>
              </circle>
            ))}
          </svg>
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-neutral-600">
          <span>{points[0].period}</span>
          <span className="text-neutral-500">min {min} · max {max}</span>
          <span>{points[points.length - 1].period}</span>
        </div>
      </CardBody>
    </Card>
  )
}
