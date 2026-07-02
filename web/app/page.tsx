import Link from 'next/link'

const features = [
  {
    title: 'Increase-Letter Intake',
    body: 'Every supplier increase letter is logged with proposed percent, effective date, stated justification, and per-SKU line items, then matched to the governing supplier and contract automatically.',
  },
  {
    title: 'Contract & Clause Library',
    body: 'Your governing agreements become structured data: caps, fixed-price windows, indexation formulas, notice windows, and cumulative multi-year caps, each with a verbatim citation on file.',
  },
  {
    title: 'Clause-Check Engine',
    body: 'Each letter is run against every applicable clause: cap, fixed-price period, notice window, and indexation eligibility. Every check returns a verdict, a severity, and the exact clause it rests on.',
  },
  {
    title: 'Index Validation',
    body: 'The cost-driver movement a supplier cites, whether PPI, CPI, ECI, a commodity index, or FX, is checked against the actual published series, weighted baskets included, and the over-ask is quantified.',
  },
  {
    title: 'Cumulative-Creep Tracker',
    body: 'Stacked increases are tracked per contract across years, compounded movement is computed, and your team is alerted before the next increase would breach a multi-year cumulative cap.',
  },
  {
    title: 'Pushback-Packet Generator',
    body: 'A clause-cited packet is assembled with the index math, the creep evidence, and a recommended counter-percent, ready for your team to review, adjust the tone, and send.',
  },
  {
    title: 'Approval Workflow & Audit',
    body: 'Multi-step approvals apply at the dollar-impact thresholds you set, with comment threads and an immutable decision log of who changed what, when, and why.',
  },
  {
    title: 'P&L Margin-Impact Rollup',
    body: 'Each letter is annualized against baseline spend, and the accepted-versus-contested delta rolls up into a single margin view your CFO can act on.',
  },
  {
    title: 'Supplier Scorecards',
    body: 'A running record per supplier: contest history, average over-ask, defensibility trend, and a behavior score for how consistently a vendor pushes beyond index or cap.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-red-600 text-sm font-bold text-white">
            V
          </span>
          <span className="text-base font-bold tracking-tight text-red-400">VendorPriceIncreaseDefenseDesk</span>
        </span>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="hidden text-sm text-neutral-300 hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-sm text-neutral-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            Request Access
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-red-800/60 bg-red-950/40 px-3 py-1 text-xs font-medium text-red-300">
          For procurement, contracts, and finance teams
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
          A disciplined answer to every price-increase letter.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-400">
          VendorPriceIncreaseDefenseDesk checks each supplier increase letter against the governing contract and the
          actual published cost-driver indices, then prepares a clause-cited pushback packet your team can stand
          behind. The result is a deterministic, auditable review, not a judgment call made under time pressure.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500"
          >
            Start a consultation
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-3 font-semibold text-neutral-200 hover:bg-neutral-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-neutral-800 bg-neutral-900/40">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-white">The margin leak most teams cannot see</h2>
          <p className="mt-4 text-neutral-400">
            Suppliers send price-increase letters in waves, typically citing rising input costs or indexation.
            Procurement teams rarely have the bandwidth to verify each letter against the governing contract or the
            published index it references, so increases are accepted more often than they should be. A one-to-two
            point over-acceptance across a large supplier base compounds into material, recurring margin erosion.
            The contract that should constrain the increase sits unread in a PDF, the cited index goes unverified,
            and multi-year cumulative caps go untracked because no one carries that history forward.
            VendorPriceIncreaseDefenseDesk closes that gap end to end, from letter, to clause, to index, to
            pushback, to the P&amp;L line it ultimately affects.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold text-white">A complete review workflow, not a checklist</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-neutral-400">
          Each capability below exists to remove a specific point of failure in how price increases are currently
          reviewed and negotiated.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
              <h3 className="text-base font-semibold text-red-300">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-800 bg-neutral-900/40">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-white">Bring your contracts. We will handle the arithmetic.</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-400">
            Every capability is included from day one. Load your contracts and reference indices, and let the
            clause-check and index-validation engines produce a defensible position on every letter.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500"
            >
              Create your account
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-3 font-semibold text-neutral-200 hover:bg-neutral-800"
            >
              Review pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-800 py-10 text-center text-sm text-neutral-600">
        <p>VendorPriceIncreaseDefenseDesk</p>
      </footer>
    </main>
  )
}
