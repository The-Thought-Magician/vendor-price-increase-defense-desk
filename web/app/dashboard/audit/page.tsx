'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

interface AuditEvent {
  id: string
  workspace_id?: string
  user_id?: string
  entity_type?: string
  entity_id?: string
  action?: string
  actor?: string
  detail?: unknown
  created_at?: string
}

function fmtDateTime(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortId(id?: string) {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function actionTone(action?: string): 'green' | 'red' | 'amber' | 'orange' | 'blue' | 'neutral' {
  const a = (action ?? '').toLowerCase()
  if (a.includes('delete') || a.includes('reject') || a.includes('breach')) return 'red'
  if (a.includes('create') || a.includes('approve') || a.includes('resolve')) return 'green'
  if (a.includes('update') || a.includes('edit') || a.includes('decide')) return 'amber'
  if (a.includes('generate') || a.includes('send') || a.includes('run')) return 'orange'
  if (a.includes('view') || a.includes('login')) return 'blue'
  return 'neutral'
}

function detailToString(detail: unknown): string {
  if (detail === null || detail === undefined) return ''
  if (typeof detail === 'string') return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return String(detail)
  }
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<AuditEvent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, unknown> = {}
      if (entityType.trim()) params.entity_type = entityType.trim()
      if (entityId.trim()) params.entity_id = entityId.trim()
      const data = await api.getAudit(Object.keys(params).length ? params : undefined)
      setEvents(Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit trail')
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => {
    load()
  }, [load])

  const entityTypes = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) if (e.entity_type) s.add(e.entity_type)
    return Array.from(s).sort()
  }, [events])

  const actions = useMemo(() => {
    const s = new Set<string>()
    for (const e of events) if (e.action) s.add(e.action)
    return Array.from(s).sort()
  }, [events])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events
      .filter((e) => {
        if (actionFilter !== 'all' && (e.action ?? '') !== actionFilter) return false
        if (!q) return true
        return (
          (e.action ?? '').toLowerCase().includes(q) ||
          (e.entity_type ?? '').toLowerCase().includes(q) ||
          (e.entity_id ?? '').toLowerCase().includes(q) ||
          (e.actor ?? '').toLowerCase().includes(q) ||
          detailToString(e.detail).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  }, [events, actionFilter, search])

  const stats = useMemo(() => {
    const actors = new Set<string>()
    const entities = new Set<string>()
    for (const e of events) {
      if (e.actor) actors.add(e.actor)
      if (e.entity_type) entities.add(e.entity_type)
    }
    return { total: events.length, actors: actors.size, entities: entities.size }
  }, [events])

  function applyServerFilters(e: React.FormEvent) {
    e.preventDefault()
    load()
  }

  function clearFilters() {
    setEntityType('')
    setEntityId('')
    setActionFilter('all')
    setSearch('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-500">
            Immutable record of every status change, decision, and contest action across the desk.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Events" value={stats.total} />
        <Stat label="Entity Types" value={stats.entities} tone="orange" />
        <Stat label="Actors" value={stats.actors} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <form onSubmit={applyServerFilters} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Entity type
              </label>
              <input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                list="audit-entity-types"
                placeholder="e.g. letter"
                className="w-44 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />
              <datalist id="audit-entity-types">
                {entityTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Entity id
              </label>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="exact id"
                className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={loading}>
              Apply
            </Button>
            <Button type="button" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActionFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  actionFilter === 'all' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All actions
              </button>
              {actions.map((a) => (
                <button
                  key={a}
                  onClick={() => setActionFilter(a)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    actionFilter === a ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-72"
            />
          </div>
        </CardHeader>

        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading audit trail…" />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={load}>
                Try again
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="🧾"
                title={events.length === 0 ? 'No audit events' : 'No events match your filters'}
                description={
                  events.length === 0
                    ? 'As you create, contest, and resolve letters the system records each action here.'
                    : 'Adjust the filters or search to see more events.'
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Actor</TH>
                  <TH>Detail</TH>
                  <TH className="text-right">{''}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((e) => {
                  const detailStr = detailToString(e.detail)
                  return (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(e.created_at)}</TD>
                      <TD>
                        <Badge tone={actionTone(e.action)}>{e.action ?? 'unknown'}</Badge>
                      </TD>
                      <TD>
                        <div className="text-sm text-slate-200">{e.entity_type ?? '—'}</div>
                        <div className="font-mono text-[11px] text-slate-500">{shortId(e.entity_id)}</div>
                      </TD>
                      <TD className="text-sm text-slate-300">{e.actor ?? '—'}</TD>
                      <TD className="text-xs text-slate-500">
                        <span className="block max-w-xs truncate" title={detailStr}>
                          {detailStr || '—'}
                        </span>
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSelected(e)}>
                          Inspect
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Event ${shortId(selected.id)}` : 'Event'}
      >
        {!selected ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Action</div>
                <div className="mt-1">
                  <Badge tone={actionTone(selected.action)}>{selected.action ?? 'unknown'}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">When</div>
                <div className="mt-1 text-slate-300">{fmtDateTime(selected.created_at)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Entity type</div>
                <div className="mt-1 text-slate-300">{selected.entity_type ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Entity id</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-300">{selected.entity_id ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Actor</div>
                <div className="mt-1 text-slate-300">{selected.actor ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Event id</div>
                <div className="mt-1 break-all font-mono text-xs text-slate-300">{selected.id}</div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">Detail</div>
              {selected.detail === null || selected.detail === undefined || selected.detail === '' ? (
                <p className="text-sm text-slate-500">No additional detail recorded.</p>
              ) : (
                <pre className="max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                  {typeof selected.detail === 'string'
                    ? selected.detail
                    : JSON.stringify(selected.detail, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
