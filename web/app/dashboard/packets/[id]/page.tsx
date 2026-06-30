'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'

interface PacketSection {
  id: string
  packet_id: string
  section_type?: string
  heading: string
  content: string
  position: number
  created_at?: string
}

interface Packet {
  id: string
  letter_id: string
  workspace_id?: string
  title: string
  tone?: string
  recommended_counter_pct?: number | null
  body?: string
  version?: number
  status?: string
  created_at?: string
  updated_at?: string
}

interface Template {
  id: string
  name: string
  breach_type?: string
  tone?: string
  body: string
}

const TONES = ['firm', 'collaborative', 'formal', 'neutral']
const STATUSES = ['draft', 'in-progress', 'packet-ready', 'sent', 'final']
const SECTION_TYPES = ['summary', 'clause-breach', 'index-validation', 'creep', 'counter-offer', 'closing', 'custom']

function fmtDate(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function PacketBuilderPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const packetId = params?.id

  const [packet, setPacket] = useState<Packet | null>(null)
  const [sections, setSections] = useState<PacketSection[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Packet meta editor
  const [meta, setMeta] = useState({ title: '', tone: 'firm', status: 'draft', recommended_counter_pct: '', body: '' })
  const [savingMeta, setSavingMeta] = useState(false)

  // Section editor modal
  const [sectionModalOpen, setSectionModalOpen] = useState(false)
  const [editingSection, setEditingSection] = useState<PacketSection | null>(null)
  const [sectionForm, setSectionForm] = useState({ section_type: 'custom', heading: '', content: '' })
  const [savingSection, setSavingSection] = useState(false)
  const [busySectionId, setBusySectionId] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!packetId) return
    setLoading(true)
    setError(null)
    try {
      const [pkt, tpls] = await Promise.all([api.getPacket(packetId), api.getTemplates()])
      const p: Packet = pkt?.packet ?? pkt
      const secs: PacketSection[] = pkt?.sections ?? []
      setPacket(p)
      setSections([...secs].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      setTemplates(Array.isArray(tpls) ? tpls : [])
      setMeta({
        title: p?.title ?? '',
        tone: p?.tone ?? 'firm',
        status: p?.status ?? 'draft',
        recommended_counter_pct:
          p?.recommended_counter_pct === null || p?.recommended_counter_pct === undefined
            ? ''
            : String(p.recommended_counter_pct),
        body: p?.body ?? '',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packet')
    } finally {
      setLoading(false)
    }
  }, [packetId])

  useEffect(() => {
    load()
  }, [load])

  async function saveMeta() {
    if (!packetId) return
    setSavingMeta(true)
    setActionError(null)
    try {
      const body: Record<string, unknown> = {
        title: meta.title,
        tone: meta.tone,
        status: meta.status,
        body: meta.body,
      }
      if (meta.recommended_counter_pct.trim() !== '') {
        body.recommended_counter_pct = Number(meta.recommended_counter_pct)
      }
      const res = await api.updatePacket(packetId, body)
      const p: Packet = res?.packet ?? res
      if (p) setPacket(p)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save packet')
    } finally {
      setSavingMeta(false)
    }
  }

  function openNewSection() {
    setEditingSection(null)
    setSectionForm({ section_type: 'custom', heading: '', content: '' })
    setSectionModalOpen(true)
  }

  function openEditSection(s: PacketSection) {
    setEditingSection(s)
    setSectionForm({ section_type: s.section_type ?? 'custom', heading: s.heading ?? '', content: s.content ?? '' })
    setSectionModalOpen(true)
  }

  function applyTemplate(templateId: string) {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    setSectionForm((f) => ({
      section_type: t.breach_type ? 'clause-breach' : f.section_type,
      heading: f.heading || t.name,
      content: f.content ? `${f.content}\n\n${t.body}` : t.body,
    }))
  }

  async function saveSection() {
    if (!packetId) return
    if (!sectionForm.heading.trim()) {
      setActionError('Section heading is required')
      return
    }
    setSavingSection(true)
    setActionError(null)
    try {
      if (editingSection) {
        const res = await api.updatePacketSection(packetId, editingSection.id, {
          section_type: sectionForm.section_type,
          heading: sectionForm.heading,
          content: sectionForm.content,
        })
        const updated: PacketSection = res?.section ?? res
        setSections((prev) =>
          prev.map((s) => (s.id === editingSection.id ? { ...s, ...updated } : s)),
        )
      } else {
        const res = await api.addPacketSection(packetId, {
          section_type: sectionForm.section_type,
          heading: sectionForm.heading,
          content: sectionForm.content,
          position: sections.length,
        })
        const created: PacketSection = res?.section ?? res
        if (created) setSections((prev) => [...prev, created].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
      }
      setSectionModalOpen(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save section')
    } finally {
      setSavingSection(false)
    }
  }

  async function removeSection(s: PacketSection) {
    if (!packetId) return
    setBusySectionId(s.id)
    setActionError(null)
    try {
      await api.deletePacketSection(packetId, s.id)
      setSections((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete section')
    } finally {
      setBusySectionId(null)
    }
  }

  // Reorder by swapping positions and persisting both.
  async function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir
    if (!packetId || target < 0 || target >= sections.length) return
    const a = sections[index]
    const b = sections[target]
    const posA = a.position ?? index
    const posB = b.position ?? target
    setBusySectionId(a.id)
    setActionError(null)
    // Optimistic swap
    const next = [...sections]
    next[index] = { ...b, position: posA }
    next[target] = { ...a, position: posB }
    next.sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
    setSections(next)
    try {
      await Promise.all([
        api.updatePacketSection(packetId, a.id, { position: posB }),
        api.updatePacketSection(packetId, b.id, { position: posA }),
      ])
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to reorder; reloading')
      load()
    } finally {
      setBusySectionId(null)
    }
  }

  async function deletePacket() {
    if (!packetId) return
    setDeleting(true)
    setActionError(null)
    try {
      await api.deletePacket(packetId)
      router.push('/dashboard/packets')
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete packet')
      setDeleting(false)
    }
  }

  const fullPreview = useMemo(() => {
    const parts: string[] = []
    if (meta.body?.trim()) parts.push(meta.body.trim())
    for (const s of sections) {
      parts.push(`## ${s.heading}\n${s.content ?? ''}`)
    }
    return parts.join('\n\n')
  }, [meta.body, sections])

  if (loading) return <PageSpinner label="Loading packet builder…" />

  if (error || !packet) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/packets" className="text-sm text-slate-400 hover:text-orange-400">
          ← Back to packets
        </Link>
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <div className="font-medium">Could not load this packet</div>
          <div className="mt-1 text-red-400/80">{error ?? 'Packet not found'}</div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/packets" className="text-sm text-slate-400 hover:text-orange-400">
          ← Back to packets
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{packet.title || 'Untitled packet'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <Badge tone={verdictTone(packet.status)}>{packet.status || 'draft'}</Badge>
              <Badge tone="blue">{packet.tone || 'neutral'}</Badge>
              {typeof packet.version === 'number' && <span>v{packet.version}</span>}
              <Link href={`/dashboard/letters/${packet.letter_id}`} className="hover:text-orange-400">
                View source letter →
              </Link>
              {packet.updated_at && <span className="text-slate-600">Updated {fmtDate(packet.updated_at)}</span>}
            </div>
          </div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete packet
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: packet metadata + section editor */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Packet Details</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Title</label>
                <input
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Tone</label>
                  <select
                    value={meta.tone}
                    onChange={(e) => setMeta({ ...meta, tone: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                  <select
                    value={meta.status}
                    onChange={(e) => setMeta({ ...meta, status: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Counter %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={meta.recommended_counter_pct}
                    onChange={(e) => setMeta({ ...meta, recommended_counter_pct: e.target.value })}
                    placeholder="e.g. 3.5"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Cover / opening body</label>
                <textarea
                  value={meta.body}
                  onChange={(e) => setMeta({ ...meta, body: e.target.value })}
                  rows={4}
                  placeholder="Opening narrative for the pushback letter…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveMeta} disabled={savingMeta}>
                  {savingMeta ? <Spinner className="h-4 w-4" /> : 'Save details'}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Sections ({sections.length})
              </h2>
              <Button size="sm" onClick={openNewSection}>
                + Add section
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              {sections.length === 0 ? (
                <EmptyState
                  icon="🧱"
                  title="No sections yet"
                  description="Add sections to build out the clause-breach, index, and counter-offer arguments."
                  action={<Button onClick={openNewSection}>Add first section</Button>}
                />
              ) : (
                sections.map((s, i) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{s.heading}</span>
                          {s.section_type && <Badge tone="neutral">{s.section_type}</Badge>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-400">
                          {s.content || <span className="italic text-slate-600">No content</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveSection(i, -1)}
                            disabled={i === 0 || busySectionId === s.id}
                            className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                            aria-label="Move up"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveSection(i, 1)}
                            disabled={i === sections.length - 1 || busySectionId === s.id}
                            className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                            aria-label="Move down"
                          >
                            ↓
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditSection(s)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSection(s)}
                            disabled={busySectionId === s.id}
                            className="text-red-400 hover:text-red-300"
                          >
                            {busySectionId === s.id ? '…' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right: live preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Live Preview</h2>
            </CardHeader>
            <CardBody>
              {fullPreview.trim() ? (
                <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">
                  {fullPreview}
                </pre>
              ) : (
                <p className="text-sm italic text-slate-600">
                  The assembled packet will appear here as you add a body and sections.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Section editor modal */}
      <Modal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        title={editingSection ? 'Edit section' : 'Add section'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSectionModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSection} disabled={savingSection}>
              {savingSection ? <Spinner className="h-4 w-4" /> : editingSection ? 'Save section' : 'Add section'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Section type</label>
            <select
              value={sectionForm.section_type}
              onChange={(e) => setSectionForm({ ...sectionForm, section_type: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          {templates.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Insert from rebuttal template</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value)
                  e.target.value = ''
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.breach_type ? ` (${t.breach_type})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Heading</label>
            <input
              value={sectionForm.heading}
              onChange={(e) => setSectionForm({ ...sectionForm, heading: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Content</label>
            <textarea
              value={sectionForm.content}
              onChange={(e) => setSectionForm({ ...sectionForm, content: e.target.value })}
              rows={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete packet?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deletePacket} disabled={deleting}>
              {deleting ? <Spinner className="h-4 w-4" /> : 'Delete permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-400">
          This will permanently delete <span className="font-medium text-slate-200">{packet.title}</span> and all of its
          sections. This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
