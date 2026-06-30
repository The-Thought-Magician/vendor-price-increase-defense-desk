'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner, Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Notification {
  id: string
  workspace_id?: string
  user_id?: string
  type?: string
  title?: string
  body?: string
  link?: string | null
  read?: boolean
  created_at?: string
}

type Filter = 'all' | 'unread' | 'read'

function fmtWhen(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function typeMeta(type?: string): { icon: string; tone: 'orange' | 'red' | 'amber' | 'green' | 'blue' | 'neutral' } {
  const t = (type ?? '').toLowerCase()
  if (t.includes('breach') || t.includes('alert')) return { icon: '🚨', tone: 'red' }
  if (t.includes('deadline') || t.includes('due')) return { icon: '⏰', tone: 'amber' }
  if (t.includes('approval')) return { icon: '🗳️', tone: 'blue' }
  if (t.includes('letter') || t.includes('increase')) return { icon: '✉️', tone: 'orange' }
  if (t.includes('packet')) return { icon: '📦', tone: 'orange' }
  if (t.includes('saving') || t.includes('won') || t.includes('resolved')) return { icon: '✅', tone: 'green' }
  return { icon: '🔔', tone: 'neutral' }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getNotifications()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markRead = useCallback(async (n: Notification) => {
    if (n.read) return
    setBusy(n.id)
    setActionError(null)
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    try {
      await api.markNotificationRead(n.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to mark read')
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)))
    } finally {
      setBusy(null)
    }
  }, [])

  const markAll = useCallback(async () => {
    setBulkBusy(true)
    setActionError(null)
    const prevItems = items
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    try {
      await api.markAllNotificationsRead()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to mark all read')
      setItems(prevItems)
    } finally {
      setBulkBusy(false)
    }
  }, [items])

  const remove = useCallback(async (n: Notification) => {
    setBusy(n.id)
    setActionError(null)
    const prevItems = items
    setItems((prev) => prev.filter((x) => x.id !== n.id))
    try {
      await api.deleteNotification(n.id)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete notification')
      setItems(prevItems)
    } finally {
      setBusy(null)
    }
  }, [items])

  const counts = useMemo(() => {
    const unread = items.filter((n) => !n.read).length
    return { total: items.length, unread, read: items.length - unread }
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter((n) => {
        if (filter === 'unread' && n.read) return false
        if (filter === 'read' && !n.read) return false
        if (!q) return true
        return (
          (n.title ?? '').toLowerCase().includes(q) ||
          (n.body ?? '').toLowerCase().includes(q) ||
          (n.type ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  }, [items, filter, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Breach alerts, approaching deadlines, approval routing, and resolved contests.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}
          </Button>
          <Button onClick={markAll} disabled={bulkBusy || counts.unread === 0}>
            {bulkBusy ? <Spinner className="h-4 w-4" /> : 'Mark all read'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total" value={counts.total} />
        <Stat label="Unread" value={counts.unread} tone="orange" />
        <Stat label="Read" value={counts.read} tone="green" />
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {actionError}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'unread', 'read'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f}
                {f === 'unread' && counts.unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-orange-500/30 px-1.5 text-[10px]">{counts.unread}</span>
                )}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-orange-500 focus:outline-none sm:w-72"
          />
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <PageSpinner label="Loading notifications…" />
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
                icon="🔔"
                title={items.length === 0 ? 'No notifications' : 'Nothing matches your filter'}
                description={
                  items.length === 0
                    ? 'You are all caught up. Alerts will show here when increases arrive, deadlines approach, or breaches are detected.'
                    : 'Try a different filter or clear your search.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/70">
              {filtered.map((n) => {
                const meta = typeMeta(n.type)
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-900/50 ${
                      n.read ? '' : 'bg-orange-950/10'
                    }`}
                  >
                    <div className="mt-0.5 text-lg" aria-hidden>
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{n.title ?? 'Notification'}</span>
                        {n.type && <Badge tone={meta.tone}>{n.type}</Badge>}
                        {!n.read && <span className="h-2 w-2 rounded-full bg-orange-500" aria-label="unread" />}
                      </div>
                      {n.body && <p className="mt-1 text-sm text-slate-400">{n.body}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span>{fmtWhen(n.created_at)}</span>
                        {n.link && (
                          <Link href={n.link} className="text-orange-400 hover:text-orange-300">
                            View →
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {!n.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markRead(n)}
                          disabled={busy === n.id}
                        >
                          {busy === n.id ? <Spinner className="h-4 w-4" /> : 'Mark read'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(n)}
                        disabled={busy === n.id}
                        aria-label="Delete notification"
                      >
                        ✕
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
