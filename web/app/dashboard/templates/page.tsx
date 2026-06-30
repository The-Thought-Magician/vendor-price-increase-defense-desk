'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'

interface Template {
  id: string
  workspace_id?: string
  name: string
  breach_type?: string
  tone?: string
  body: string
  created_at?: string
}

const BREACH_TYPES = [
  'cap-exceeded',
  'cumulative-cap',
  'notice-period',
  'fixed-window',
  'index-overstated',
  'no-justification',
  'general',
]
const TONES = ['firm', 'collaborative', 'formal', 'neutral']

const emptyForm = { name: '', breach_type: 'general', tone: 'firm', body: '' }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [breachFilter, setBreachFilter] = useState('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getTemplates()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const breachTypes = useMemo(() => {
    const set = new Set<string>()
    for (const t of templates) if (t.breach_type) set.add(t.breach_type)
    return Array.from(set).sort()
  }, [templates])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (breachFilter !== 'all' && t.breach_type !== breachFilter) return false
      if (!q) return true
      return (
        t.name?.toLowerCase().includes(q) ||
        (t.body ?? '').toLowerCase().includes(q) ||
        (t.breach_type ?? '').toLowerCase().includes(q) ||
        (t.tone ?? '').toLowerCase().includes(q)
      )
    })
  }, [templates, search, breachFilter])

  const stats = useMemo(() => {
    return {
      total: templates.length,
      breachKinds: breachTypes.length,
      tones: new Set(templates.map((t) => t.tone).filter(Boolean)).size,
    }
  }, [templates, breachTypes])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setActionError(null)
    setModalOpen(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setForm({ name: t.name ?? '', breach_type: t.breach_type ?? 'general', tone: t.tone ?? 'firm', body: t.body ?? '' })
    setActionError(null)
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      setActionError('Template name is required')
      return
    }
    if (!form.body.trim()) {
      setActionError('Template body is required')
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      if (editing) {
        const res = await api.updateTemplate(editing.id, form)
        const updated: Template = res?.template ?? res
        setTemplates((prev) => prev.map((t) => (t.id === editing.id ? { ...t, ...updated } : t)))
      } else {
        const res = await api.createTemplate(form)
        const created: Template = res?.template ?? res
        if (created) setTemplates((prev) => [created, ...prev])
      }
      setModalOpen(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setActionError(null)
    try {
      await api.deleteTemplate(deleteTarget.id)
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete template')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Rebuttal Templates</h1>
          <p className="mt-1 text-sm text-slate-400">
            Reusable argument blocks keyed by breach type and tone. Pulled into packets when you push back.
          </p>
        </div>
        <Button onClick={openCreate}>+ New template</Button>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Templates" value={stats.total} />
          <Stat label="Breach Types Covered" value={stats.breachKinds} tone="orange" />
          <Stat label="Distinct Tones" value={stats.tones} />
        </div>
      )}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-orange-500 focus:outline-none sm:max-w-sm"
            />
            <select
              value={breachFilter}
              onChange={(e) => setBreachFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All breach types</option>
              {breachTypes.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500 sm:ml-auto">
              {filtered.length} of {templates.length} shown
            </div>
          </div>

          {loading ? (
            <PageSpinner label="Loading templates…" />
          ) : error ? (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              <div className="font-medium">Could not load templates</div>
              <div className="mt-1 text-red-400/80">{error}</div>
              <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
                Retry
              </Button>
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon="🗂️"
              title="No rebuttal templates yet"
              description="Create your first template so packet generation can reuse proven negotiation language."
              action={<Button onClick={openCreate}>Create template</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState icon="🔍" title="No matching templates" description="Adjust your search or filter." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.map((t) => (
                <div key={t.id} className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-100">{t.name}</h3>
                    <div className="flex shrink-0 gap-1.5">
                      {t.breach_type && <Badge tone="orange">{t.breach_type}</Badge>}
                      {t.tone && <Badge tone="blue">{t.tone}</Badge>}
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-5 whitespace-pre-wrap break-words text-sm text-slate-400">
                    {t.body}
                  </p>
                  <div className="mt-4 flex justify-end gap-1 border-t border-slate-800/70 pt-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setDeleteTarget(t)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit template' : 'New rebuttal template'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Create template'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {actionError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Cap-exceeded firm rebuttal"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Breach type</label>
              <select
                value={form.breach_type}
                onChange={(e) => setForm({ ...form, breach_type: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                {BREACH_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tone</label>
              <select
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Body</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={9}
              placeholder="Use placeholders like {{supplier}}, {{cap_pct}}, {{proposed_pct}} that packet generation can fill…"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-600">
              Reference contract values with placeholders; packet generation substitutes them per letter.
            </p>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete template?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-400">
          Delete <span className="font-medium text-slate-200">{deleteTarget?.name}</span>? This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
