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

interface Rule {
  id: string
  metric: string
  operator: string
  threshold: number
  action: string
}

interface Playbook {
  id: string
  workspace_id?: string
  user_id?: string
  name: string
  category_id?: string | null
  contest_over_ask_pct?: number | null
  auto_accept_within_index?: boolean | null
  auto_accept_under_cap?: boolean | null
  rules?: Rule[] | null
  is_active?: boolean | null
  created_at?: string
}

interface Category {
  id: string
  name: string
}

const METRICS = [
  { value: 'proposed_pct', label: 'Proposed increase %' },
  { value: 'over_ask_pct', label: 'Over-ask vs index %' },
  { value: 'cumulative_pct', label: 'Cumulative creep %' },
  { value: 'annual_impact_cents', label: 'Annual impact ($)' },
]
const OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'eq', label: '=' },
]
const ACTIONS = [
  { value: 'auto_accept', label: 'Auto-accept', tone: 'green' as const },
  { value: 'contest', label: 'Contest', tone: 'orange' as const },
  { value: 'escalate', label: 'Escalate', tone: 'red' as const },
  { value: 'review', label: 'Flag for review', tone: 'amber' as const },
]

function opLabel(v: string) {
  return OPERATORS.find((o) => o.value === v)?.label ?? v
}
function metricLabel(v: string) {
  return METRICS.find((m) => m.value === v)?.label ?? v
}
function actionMeta(v: string) {
  return ACTIONS.find((a) => a.value === v) ?? { value: v, label: v, tone: 'neutral' as const }
}

const emptyForm = () => ({
  name: '',
  category_id: '',
  contest_over_ask_pct: '5',
  auto_accept_within_index: true,
  auto_accept_under_cap: true,
  is_active: true,
  rules: [] as Rule[],
})

function newRule(): Rule {
  return {
    id: Math.random().toString(36).slice(2),
    metric: 'proposed_pct',
    operator: 'gt',
    threshold: 0,
    action: 'contest',
  }
}

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pb, cats] = await Promise.all([api.getPlaybooks(), api.getCategories()])
      setPlaybooks(Array.isArray(pb) ? pb : [])
      setCategories(Array.isArray(cats) ? cats : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load playbooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const catName = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  const stats = useMemo(() => {
    const active = playbooks.filter((p) => p.is_active).length
    const rules = playbooks.reduce((sum, p) => sum + (Array.isArray(p.rules) ? p.rules.length : 0), 0)
    const scoped = playbooks.filter((p) => p.category_id).length
    return { total: playbooks.length, active, rules, scoped }
  }, [playbooks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return playbooks.filter((p) => {
      if (activeFilter === 'active' && !p.is_active) return false
      if (activeFilter === 'inactive' && p.is_active) return false
      if (!q) return true
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.category_id ? (catName.get(p.category_id) ?? '').toLowerCase().includes(q) : false)
      )
    })
  }, [playbooks, activeFilter, search, catName])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: Playbook) {
    setEditing(p)
    setForm({
      name: p.name ?? '',
      category_id: p.category_id ?? '',
      contest_over_ask_pct:
        p.contest_over_ask_pct === null || p.contest_over_ask_pct === undefined
          ? ''
          : String(p.contest_over_ask_pct),
      auto_accept_within_index: !!p.auto_accept_within_index,
      auto_accept_under_cap: !!p.auto_accept_under_cap,
      is_active: p.is_active ?? true,
      rules: Array.isArray(p.rules)
        ? p.rules.map((r) => ({
            id: r.id ?? Math.random().toString(36).slice(2),
            metric: r.metric ?? 'proposed_pct',
            operator: r.operator ?? 'gt',
            threshold: Number(r.threshold ?? 0),
            action: r.action ?? 'contest',
          }))
        : [],
    })
    setFormError(null)
    setModalOpen(true)
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    setForm((f) => ({ ...f, rules: f.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }
  function removeRule(id: string) {
    setForm((f) => ({ ...f, rules: f.rules.filter((r) => r.id !== id) }))
  }
  function addRule() {
    setForm((f) => ({ ...f, rules: [...f.rules, newRule()] }))
  }

  const save = useCallback(async () => {
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    const pct = form.contest_over_ask_pct.trim()
    if (pct !== '' && Number.isNaN(Number(pct))) {
      setFormError('Contest over-ask % must be a number.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      contest_over_ask_pct: pct === '' ? null : Number(pct),
      auto_accept_within_index: form.auto_accept_within_index,
      auto_accept_under_cap: form.auto_accept_under_cap,
      is_active: form.is_active,
      rules: form.rules.map((r) => ({
        metric: r.metric,
        operator: r.operator,
        threshold: Number(r.threshold),
        action: r.action,
      })),
    }
    try {
      if (editing) await api.updatePlaybook(editing.id, body)
      else await api.createPlaybook(body)
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save playbook')
    } finally {
      setSaving(false)
    }
  }, [form, editing, load])

  const toggleActive = useCallback(
    async (p: Playbook) => {
      setBusyId(p.id)
      setError(null)
      try {
        await api.updatePlaybook(p.id, { is_active: !p.is_active })
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update playbook')
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  const remove = useCallback(
    async (p: Playbook) => {
      if (!confirm(`Delete playbook "${p.name}"? This cannot be undone.`)) return
      setBusyId(p.id)
      setError(null)
      try {
        await api.deletePlaybook(p.id)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete playbook')
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Decision Playbooks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Codify when to auto-accept, contest or escalate an increase. Threshold rules drive consistent responses across the desk.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
          <Button onClick={openCreate}>+ New playbook</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Playbooks" value={stats.total} />
        <Stat label="Active" value={stats.active} tone="green" />
        <Stat label="Threshold rules" value={stats.rules} tone="orange" />
        <Stat label="Category-scoped" value={stats.scoped} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  activeFilter === f
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading playbooks…" />
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
                icon="📘"
                title={playbooks.length === 0 ? 'No playbooks yet' : 'No matching playbooks'}
                description={
                  playbooks.length === 0
                    ? 'Create a playbook to automate accept / contest / escalate decisions with threshold rules.'
                    : 'Adjust the filter or search to see more.'
                }
                action={playbooks.length === 0 ? <Button onClick={openCreate}>+ New playbook</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {filtered.map((p) => {
                const rules = Array.isArray(p.rules) ? p.rules : []
                return (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-white">{p.name}</h3>
                          <Badge tone={p.is_active ? 'green' : 'neutral'}>
                            {p.is_active ? 'active' : 'inactive'}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {p.category_id ? (catName.get(p.category_id) ?? 'Unknown category') : 'All categories'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-xs text-slate-500">Contest over-ask</div>
                        <div className="text-sm font-semibold tabular-nums text-orange-400">
                          {p.contest_over_ask_pct === null || p.contest_over_ask_pct === undefined
                            ? '—'
                            : `${p.contest_over_ask_pct}%`}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-xs text-slate-500">Accept ≤ index</div>
                        <div className="text-sm font-semibold">
                          {p.auto_accept_within_index ? (
                            <span className="text-emerald-400">yes</span>
                          ) : (
                            <span className="text-slate-500">no</span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-xs text-slate-500">Accept ≤ cap</div>
                        <div className="text-sm font-semibold">
                          {p.auto_accept_under_cap ? (
                            <span className="text-emerald-400">yes</span>
                          ) : (
                            <span className="text-slate-500">no</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Threshold rules ({rules.length})
                      </div>
                      {rules.length === 0 ? (
                        <p className="text-xs text-slate-600">No custom rules. Defaults above apply.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {rules.map((r, i) => {
                            const meta = actionMeta(r.action)
                            return (
                              <div
                                key={r.id ?? i}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs"
                              >
                                <span className="text-slate-300">
                                  <span className="text-slate-500">If</span> {metricLabel(r.metric)}{' '}
                                  <span className="font-mono text-orange-300">{opLabel(r.operator)} {r.threshold}</span>
                                </span>
                                <Badge tone={meta.tone}>{meta.label}</Badge>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(p)}
                        disabled={busyId === p.id}
                      >
                        {busyId === p.id ? <Spinner className="h-4 w-4" /> : p.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(p)} disabled={busyId === p.id}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit playbook' : 'New playbook'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Create playbook'}
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
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. SaaS renewals — standard defense"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Category scope
              </label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                <option value="">All categories</option>
                {[...categories]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Contest over-ask %
              </label>
              <input
                type="number"
                step="0.1"
                value={form.contest_over_ask_pct}
                onChange={(e) => setForm({ ...form, contest_over_ask_pct: e.target.value })}
                placeholder="5"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.auto_accept_within_index}
                onChange={(e) => setForm({ ...form, auto_accept_within_index: e.target.checked })}
                className="h-4 w-4 accent-orange-600"
              />
              Auto-accept within index
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.auto_accept_under_cap}
                onChange={(e) => setForm({ ...form, auto_accept_under_cap: e.target.checked })}
                className="h-4 w-4 accent-orange-600"
              />
              Auto-accept under cap
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 accent-orange-600"
            />
            Playbook is active
          </label>

          <div className="border-t border-slate-800 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Threshold rules</label>
              <Button size="sm" variant="secondary" onClick={addRule}>
                + Add rule
              </Button>
            </div>
            {form.rules.length === 0 ? (
              <p className="text-xs text-slate-600">
                No rules yet. Add a rule like “if proposed % &gt; 8 then escalate”.
              </p>
            ) : (
              <div className="space-y-2">
                {form.rules.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-[1fr_auto_auto_1fr_auto] items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2"
                  >
                    <select
                      value={r.metric}
                      onChange={(e) => updateRule(r.id, { metric: e.target.value })}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                    >
                      {METRICS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.operator}
                      onChange={(e) => updateRule(r.id, { operator: e.target.value })}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                    >
                      {OPERATORS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="any"
                      value={r.threshold}
                      onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) })}
                      className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                    />
                    <select
                      value={r.action}
                      onChange={(e) => updateRule(r.id, { action: e.target.value })}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-orange-500 focus:outline-none"
                    >
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeRule(r.id)}
                      className="rounded-md px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-red-300"
                      aria-label="Remove rule"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
