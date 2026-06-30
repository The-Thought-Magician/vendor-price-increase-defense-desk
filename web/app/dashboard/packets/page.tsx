'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface Packet {
  id: string
  letter_id: string
  title: string
  tone?: string
  status?: string
  recommended_counter_pct?: number
  version?: number
  created_at?: string
  updated_at?: string
}

interface Letter {
  id: string
  title: string
  proposed_pct?: number
  status?: string
  supplier_id?: string
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PacketsPage() {
  const [packets, setPackets] = useState<Packet[]>([])
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [pk, lt] = await Promise.all([api.getPackets(), api.getLetters()])
      setPackets(Array.isArray(pk) ? pk : [])
      setLetters(Array.isArray(lt) ? lt : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const letterMap = useMemo(() => {
    const m = new Map<string, Letter>()
    for (const l of letters) m.set(l.id, l)
    return m
  }, [letters])

  const statuses = useMemo(() => {
    const set = new Set<string>()
    for (const p of packets) if (p.status) set.add(p.status)
    return Array.from(set).sort()
  }, [packets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return packets.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (!q) return true
      const letter = letterMap.get(p.letter_id)
      return (
        p.title?.toLowerCase().includes(q) ||
        (p.tone ?? '').toLowerCase().includes(q) ||
        (letter?.title ?? '').toLowerCase().includes(q)
      )
    })
  }, [packets, search, statusFilter, letterMap])

  const stats = useMemo(() => {
    const total = packets.length
    const ready = packets.filter((p) => ['packet-ready', 'final', 'sent'].includes((p.status ?? '').toLowerCase())).length
    const draft = packets.filter((p) => ['draft', 'in-progress'].includes((p.status ?? '').toLowerCase())).length
    const counters = packets.filter((p) => typeof p.recommended_counter_pct === 'number')
    const avgCounter =
      counters.length > 0
        ? counters.reduce((s, p) => s + (p.recommended_counter_pct ?? 0), 0) / counters.length
        : 0
    return { total, ready, draft, avgCounter }
  }, [packets])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pushback Packets</h1>
          <p className="mt-1 text-sm text-slate-400">
            Negotiation-ready rebuttal packets assembled from clause checks, index validations, and creep records.
          </p>
        </div>
        <Link href="/dashboard/letters">
          <Button variant="secondary">Generate from a letter</Button>
        </Link>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Total Packets" value={stats.total} />
          <Stat label="Ready / Sent" value={stats.ready} tone="green" />
          <Stat label="In Draft" value={stats.draft} tone="orange" />
          <Stat label="Avg Counter" value={`${stats.avgCounter.toFixed(1)}%`} tone="orange" />
        </div>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packets by title, tone, or letter…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/60 sm:max-w-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500 sm:ml-auto">
              {filtered.length} of {packets.length} shown
            </div>
          </div>

          {loading ? (
            <PageSpinner label="Loading packets…" />
          ) : error ? (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <div className="font-medium">Could not load packets</div>
              <div className="mt-1 text-red-400/80">{error}</div>
              <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
                Retry
              </Button>
            </div>
          ) : packets.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No pushback packets yet"
              description="Open an increase letter and generate a packet to assemble your negotiation case."
              action={
                <Link href="/dashboard/letters">
                  <Button>Go to letters</Button>
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No matching packets"
              description="Adjust your search or status filter to see more packets."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Packet</TH>
                  <TH>Letter</TH>
                  <TH>Tone</TH>
                  <TH>Counter</TH>
                  <TH>Status</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const letter = letterMap.get(p.letter_id)
                  return (
                    <TR key={p.id}>
                      <TD className="font-medium text-slate-100">
                        <Link href={`/dashboard/packets/${p.id}`} className="hover:text-orange-400">
                          {p.title || 'Untitled packet'}
                        </Link>
                        {typeof p.version === 'number' && (
                          <span className="ml-2 text-xs text-slate-500">v{p.version}</span>
                        )}
                      </TD>
                      <TD>
                        {letter ? (
                          <Link
                            href={`/dashboard/letters/${letter.id}`}
                            className="text-slate-300 hover:text-orange-400"
                          >
                            {letter.title}
                          </Link>
                        ) : (
                          <span className="text-slate-500">{p.letter_id?.slice(0, 8) ?? '—'}</span>
                        )}
                        {typeof letter?.proposed_pct === 'number' && (
                          <span className="ml-2 text-xs text-red-400">+{letter.proposed_pct}%</span>
                        )}
                      </TD>
                      <TD>
                        <Badge tone="blue">{p.tone || 'neutral'}</Badge>
                      </TD>
                      <TD className="tabular-nums text-orange-400">
                        {typeof p.recommended_counter_pct === 'number'
                          ? `${p.recommended_counter_pct}%`
                          : '—'}
                      </TD>
                      <TD>
                        <Badge tone={verdictTone(p.status)}>{p.status || 'draft'}</Badge>
                      </TD>
                      <TD className="text-slate-400">{fmtDate(p.updated_at || p.created_at)}</TD>
                      <TD className="text-right">
                        <Link href={`/dashboard/packets/${p.id}`}>
                          <Button variant="ghost" size="sm">
                            Open builder
                          </Button>
                        </Link>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
