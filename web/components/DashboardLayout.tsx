'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'
import { PageSpinner } from '@/components/ui/Spinner'

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard' }],
  },
  {
    title: 'Increases',
    items: [
      { label: 'Letters', href: '/dashboard/letters' },
      { label: 'Packets', href: '/dashboard/packets' },
      { label: 'Scenarios', href: '/dashboard/scenarios' },
      { label: 'Approvals', href: '/dashboard/approvals' },
    ],
  },
  {
    title: 'Agreements',
    items: [
      { label: 'Suppliers', href: '/dashboard/suppliers' },
      { label: 'Contracts', href: '/dashboard/contracts' },
      { label: 'Categories', href: '/dashboard/categories' },
    ],
  },
  {
    title: 'Data & Rules',
    items: [
      { label: 'Indices', href: '/dashboard/indices' },
      { label: 'Baselines', href: '/dashboard/baselines' },
      { label: 'Templates', href: '/dashboard/templates' },
      { label: 'Playbooks', href: '/dashboard/playbooks' },
    ],
  },
  {
    title: 'Track',
    items: [
      { label: 'Deadlines', href: '/dashboard/deadlines' },
      { label: 'Reports', href: '/dashboard/reports' },
      { label: 'Notifications', href: '/dashboard/notifications' },
      { label: 'Audit', href: '/dashboard/audit' },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', href: '/dashboard/settings' }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [userName, setUserName] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const s = await authClient.getSession()
      if (!active) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      setUserName(s.data.user.name ?? s.data.user.email ?? 'Account')
      setReady(true)
    })()
    return () => {
      active = false
    }
  }, [router])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950">
        <PageSpinner />
      </div>
    )
  }

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-orange-600/15 font-medium text-orange-300 ring-1 ring-inset ring-orange-700/40'
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-800 bg-slate-900/40 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-600 text-sm font-black text-white">
            V
          </span>
          <span className="text-sm font-bold tracking-tight text-white">VendorPriceIncreaseDefenseDesk</span>
        </Link>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/80" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <span className="text-sm font-bold text-white">VendorPriceIncreaseDefenseDesk</span>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-slate-300">Defense Desk</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">{userName}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}
