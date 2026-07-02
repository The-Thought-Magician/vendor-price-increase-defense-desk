'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Mail,
  Package,
  FlaskConical,
  CheckSquare,
  Building2,
  FileText,
  Tags,
  LineChart,
  Ruler,
  ClipboardList,
  BookOpen,
  CalendarClock,
  BarChart3,
  Bell,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { authClient } from '@/lib/auth/client'
import { PageSpinner } from '@/components/ui/Spinner'

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavSection = { title: string; items: NavItem[] }

const sections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Increases',
    items: [
      { label: 'Letters', href: '/dashboard/letters', icon: Mail },
      { label: 'Packets', href: '/dashboard/packets', icon: Package },
      { label: 'Scenarios', href: '/dashboard/scenarios', icon: FlaskConical },
      { label: 'Approvals', href: '/dashboard/approvals', icon: CheckSquare },
    ],
  },
  {
    title: 'Agreements',
    items: [
      { label: 'Suppliers', href: '/dashboard/suppliers', icon: Building2 },
      { label: 'Contracts', href: '/dashboard/contracts', icon: FileText },
      { label: 'Categories', href: '/dashboard/categories', icon: Tags },
    ],
  },
  {
    title: 'Data & Rules',
    items: [
      { label: 'Indices', href: '/dashboard/indices', icon: LineChart },
      { label: 'Baselines', href: '/dashboard/baselines', icon: Ruler },
      { label: 'Templates', href: '/dashboard/templates', icon: ClipboardList },
      { label: 'Playbooks', href: '/dashboard/playbooks', icon: BookOpen },
    ],
  },
  {
    title: 'Track',
    items: [
      { label: 'Deadlines', href: '/dashboard/deadlines', icon: CalendarClock },
      { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
      { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
      { label: 'Audit', href: '/dashboard/audit', icon: ShieldCheck },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Settings', href: '/dashboard/settings', icon: Settings }],
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
      <div className="min-h-screen bg-neutral-950">
        <PageSpinner />
      </div>
    )
  }

  // Icon-only rail nav (desktop): every item shows only its icon, with a
  // tooltip on hover carrying the label. Section titles collapse to a
  // hairline divider so the rail stays a fixed icon width.
  const railNav = (
    <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
      {sections.map((section, i) => (
        <div key={section.title} className={i > 0 ? 'border-t border-neutral-800 pt-3' : ''}>
          <div className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-label={item.label}
                  title={item.label}
                  className={`group relative flex items-center justify-center rounded-lg py-2.5 transition-colors ${
                    active
                      ? 'bg-red-600/15 text-red-300 ring-1 ring-inset ring-red-700/40'
                      : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-100'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-100 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )

  // Full-label nav for the mobile drawer, where a persistent icon rail
  // doesn't make sense on a narrow viewport.
  const mobileNav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-red-600/15 font-medium text-red-300 ring-1 ring-inset ring-red-700/40'
                      : 'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Sidebar (desktop): persistent icon-only rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-16 flex-col border-r border-neutral-800 bg-neutral-900/40 lg:flex">
        <Link
          href="/dashboard"
          className="flex items-center justify-center border-b border-neutral-800 px-2 py-4"
          title="VendorPriceIncreaseDefenseDesk"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-sm font-bold text-white">
            V
          </span>
        </Link>
        {railNav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-neutral-950/80" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <span className="text-sm font-bold text-white">VendorPriceIncreaseDefenseDesk</span>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            {mobileNav}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pl-16">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-neutral-300">Defense Desk</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-400 sm:inline">{userName}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
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
