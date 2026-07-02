'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const included = [
  'Increase-letter intake with per-SKU line items',
  'Contract repository and clause library',
  'Clause-check engine (cap, fixed-price, notice, indexation)',
  'Index validation against published series and weighted baskets',
  'Cumulative multi-year creep tracking',
  'Pushback-packet generator with tone templates',
  'Approval workflow and immutable audit trail',
  'P&L margin-impact rollup and inflation-wave reports',
  'Supplier profiles, scorecards, and spend baselines',
  'Counter-offer scenario modeling',
  'Deadline tracking and notifications',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/proxy/billing/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setStripeEnabled(Boolean(data.stripeEnabled))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-sm font-bold text-white">
            V
          </span>
          <span className="text-base font-bold tracking-tight text-red-400">VendorPriceIncreaseDefenseDesk</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in" className="text-sm text-neutral-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">Simple pricing</h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          Every feature is free while we are in beta. No seat limits, no feature gates, no credit card to start.
        </p>

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-red-800/50 bg-neutral-900/60 p-8 text-left shadow-xl shadow-red-950/20">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold text-white">Free</span>
            <span className="rounded-full border border-red-800/60 bg-red-950/40 px-3 py-1 text-xs font-medium text-red-300">
              All features
            </span>
          </div>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-5xl font-bold text-white">$0</span>
            <span className="pb-1 text-neutral-500">/ month</span>
          </div>
          <Link
            href="/auth/sign-up"
            className="mt-6 block rounded-lg bg-red-600 py-3 text-center font-semibold text-white hover:bg-red-500"
          >
            Get started free
          </Link>
          <ul className="mt-6 space-y-2 text-sm text-neutral-300">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-red-400" aria-hidden>
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-neutral-500">
            {stripeEnabled === true
              ? 'Paid plans are available — manage billing from Settings.'
              : 'Paid plans arrive later. For now, everything is on the house.'}
          </p>
        </div>
      </section>

      <footer className="border-t border-neutral-800 py-10 text-center text-sm text-neutral-600">
        <p>VendorPriceIncreaseDefenseDesk</p>
      </footer>
    </main>
  )
}
