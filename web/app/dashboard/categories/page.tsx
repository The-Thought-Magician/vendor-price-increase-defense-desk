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

interface Category {
  id: string
  workspace_id?: string
  user_id?: string
  name: string
  parent_id?: string | null
  description?: string | null
  created_at?: string
}

interface TreeNode extends Category {
  children: TreeNode[]
  depth: number
}

const emptyForm = () => ({ name: '', parent_id: '', description: '' })

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getCategories()
      setCategories(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categories) m.set(c.id, c.name)
    return m
  }, [categories])

  const childCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categories) {
      if (c.parent_id) m.set(c.parent_id, (m.get(c.parent_id) ?? 0) + 1)
    }
    return m
  }, [categories])

  // Build a depth-ordered tree (roots first, children nested).
  const tree = useMemo<TreeNode[]>(() => {
    const nodes = new Map<string, TreeNode>()
    for (const c of categories) nodes.set(c.id, { ...c, children: [], depth: 0 })
    const roots: TreeNode[] = []
    for (const node of nodes.values()) {
      const parent = node.parent_id ? nodes.get(node.parent_id) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    const sortRec = (arr: TreeNode[]) => {
      arr.sort((a, b) => a.name.localeCompare(b.name))
      for (const n of arr) sortRec(n.children)
    }
    sortRec(roots)
    const flat: TreeNode[] = []
    const walk = (arr: TreeNode[], depth: number) => {
      for (const n of arr) {
        n.depth = depth
        flat.push(n)
        walk(n.children, depth + 1)
      }
    }
    walk(roots, 0)
    return flat
  }, [categories])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tree
    // Keep matching nodes plus their ancestor chain so the hierarchy stays readable.
    const byId = new Map(tree.map((n) => [n.id, n]))
    const keep = new Set<string>()
    for (const n of tree) {
      if (
        n.name.toLowerCase().includes(q) ||
        (n.description ?? '').toLowerCase().includes(q)
      ) {
        let cur: TreeNode | undefined = n
        while (cur) {
          keep.add(cur.id)
          cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
        }
      }
    }
    return tree.filter((n) => keep.has(n.id))
  }, [tree, search])

  const stats = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id).length
    let maxDepth = 0
    for (const n of tree) maxDepth = Math.max(maxDepth, n.depth + 1)
    return { total: categories.length, roots, children: categories.length - roots, maxDepth }
  }, [categories, tree])

  function openCreate(parentId?: string) {
    setEditing(null)
    setForm({ ...emptyForm(), parent_id: parentId ?? '' })
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(c: Category) {
    setEditing(c)
    setForm({ name: c.name ?? '', parent_id: c.parent_id ?? '', description: c.description ?? '' })
    setFormError(null)
    setModalOpen(true)
  }

  // Categories that cannot be a parent of `editing` (itself + its descendants).
  const invalidParents = useMemo(() => {
    if (!editing) return new Set<string>()
    const out = new Set<string>([editing.id])
    const childMap = new Map<string, string[]>()
    for (const c of categories) {
      if (c.parent_id) {
        const arr = childMap.get(c.parent_id) ?? []
        arr.push(c.id)
        childMap.set(c.parent_id, arr)
      }
    }
    const stack = [editing.id]
    while (stack.length) {
      const id = stack.pop()!
      for (const child of childMap.get(id) ?? []) {
        out.add(child)
        stack.push(child)
      }
    }
    return out
  }, [editing, categories])

  const save = useCallback(async () => {
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    setSaving(true)
    setFormError(null)
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      parent_id: form.parent_id || null,
    }
    try {
      if (editing) await api.updateCategory(editing.id, body)
      else await api.createCategory(body)
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }, [form, editing, load])

  const remove = useCallback(
    async (c: Category) => {
      const kids = childCount.get(c.id) ?? 0
      const msg =
        kids > 0
          ? `Delete "${c.name}"? It has ${kids} sub-categor${kids === 1 ? 'y' : 'ies'} that may be affected.`
          : `Delete "${c.name}"? This cannot be undone.`
      if (!confirm(msg)) return
      setBusyId(c.id)
      setError(null)
      try {
        await api.deleteCategory(c.id)
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete category')
      } finally {
        setBusyId(null)
      }
    },
    [childCount, load],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Category Taxonomy</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organise spend categories into a hierarchy. Suppliers, baselines and playbooks all hang off these.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
          <Button onClick={() => openCreate()}>+ New category</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Categories" value={stats.total} />
        <Stat label="Top-level" value={stats.roots} tone="orange" />
        <Stat label="Sub-categories" value={stats.children} />
        <Stat label="Max depth" value={stats.maxDepth} />
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Taxonomy tree</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading categories…" />
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" className="mt-4" onClick={load}>
                Try again
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="🗂️"
                title={categories.length === 0 ? 'No categories yet' : 'No matching categories'}
                description={
                  categories.length === 0
                    ? 'Create a top-level category to start building your spend taxonomy.'
                    : 'Adjust your search to see more.'
                }
                action={categories.length === 0 ? <Button onClick={() => openCreate()}>+ New category</Button> : undefined}
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {visible.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-900/50"
                >
                  <div className="min-w-0 flex items-center gap-2" style={{ paddingLeft: `${n.depth * 20}px` }}>
                    {n.depth > 0 && <span className="text-slate-600">↳</span>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-slate-200">{n.name}</span>
                        {(childCount.get(n.id) ?? 0) > 0 && (
                          <Badge tone="neutral">{childCount.get(n.id)} sub</Badge>
                        )}
                        {n.parent_id && (
                          <span className="truncate text-xs text-slate-600">
                            under {nameById.get(n.parent_id) ?? '—'}
                          </span>
                        )}
                      </div>
                      {n.description && (
                        <div className="truncate text-xs text-slate-500">{n.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openCreate(n.id)}>
                      + Sub
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(n)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(n)} disabled={busyId === n.id}>
                      {busyId === n.id ? <Spinner className="h-4 w-4" /> : 'Delete'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit category' : 'New category'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Create category'}
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
              placeholder="e.g. IT & Software"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Parent category
            </label>
            <select
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-orange-500 focus:outline-none"
            >
              <option value="">— none (top level) —</option>
              {categories
                .filter((c) => !invalidParents.has(c.id))
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
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Optional notes about what belongs in this category."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
