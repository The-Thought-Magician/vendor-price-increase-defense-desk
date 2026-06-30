import Link from 'next/link'

const features = [
  {
    title: 'Increase-Letter Intake',
    body: 'Log every supplier increase letter with proposed percent, effective date, justification, and per-SKU line items. Auto-suggest the matching supplier and contract.',
  },
  {
    title: 'Contract & Clause Library',
    body: 'Store contracts with caps, fixed-price windows, indexation formulas, notice windows, and cumulative multi-year caps, with verbatim citation snippets.',
  },
  {
    title: 'Clause-Check Engine',
    body: 'Run deterministic checks per letter: cap, fixed-price period, notice window, and indexation eligibility, each with a verdict, severity, and clause citation.',
  },
  {
    title: 'Index Validation',
    body: 'Compare the claimed cost-driver movement (PPI, CPI, ECI, commodity, FX) to the actual published series, including weighted baskets, and flag the over-ask delta.',
  },
  {
    title: 'Cumulative-Creep Tracker',
    body: 'Track stacked increases per contract over time, compute compounded movement, and alert when the next increase would breach a multi-year cumulative cap.',
  },
  {
    title: 'Pushback-Packet Generator',
    body: 'Assemble a clause-cited packet with index math, creep evidence, and a recommended counter-percent. Choose tone, edit the draft, export to text or markdown.',
  },
  {
    title: 'Approval Workflow & Audit',
    body: 'Multi-step approvals with dollar-impact thresholds, comment threads, and an immutable decision log of who changed what, when, and why.',
  },
  {
    title: 'P&L Margin-Impact Rollup',
    body: 'Annualize each letter from baseline spend and the accepted-vs-contested delta, then roll up total proposed, accepted, and avoided savings for the CFO.',
  },
  {
    title: 'Supplier Scorecards',
    body: 'Per-supplier history of contests, average over-ask, defensibility trend, and a behavior score for how often a vendor pushes beyond index or cap.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-600 text-sm font-black text-white">
            V
          </span>
          <span className="text-base font-black tracking-tight text-orange-400">VendorPriceIncreaseDefenseDesk</span>
        </span>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="hidden text-sm text-slate-300 hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">
            Sign In
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-orange-800/60 bg-orange-950/40 px-3 py-1 text-xs font-medium text-orange-300">
          Defend margin one letter at a time
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-6xl">
          Stop over-accepting supplier price increases.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          VendorPriceIncreaseDefenseDesk validates every increase letter against the governing contract and the real
          published indices, then generates a clause-cited pushback packet your team can send back. Deterministic,
          auditable, and rolled up to a CFO-ready margin view.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-500"
          >
            Start defending margin
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-white">The quiet margin leak</h2>
          <p className="mt-4 text-slate-400">
            Suppliers fire off price-increase letters in inflation waves, citing &ldquo;rising input costs&rdquo; or
            &ldquo;indexation.&rdquo; Buyers lack the bandwidth to check each letter against the actual contract and the
            actual published index movement, so they over-accept. A one-to-two point over-acceptance across a large
            supplier base is real, recurring margin erosion. The contract that should constrain the increase is a PDF
            nobody re-reads, the cited index is rarely validated, and multi-year cumulative caps are almost never
            tracked. VendorPriceIncreaseDefenseDesk closes that loop, from letter to clause to index to pushback to P&amp;L.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold text-white">Everything the defense workflow needs</h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-base font-semibold text-orange-300">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-white">Turn every increase letter into a defensible decision.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-400">
            Free to start, with every feature included. Bring your contracts and your indices and let the engine do the
            math.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/sign-up"
              className="rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-500"
            >
              Create your account
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-10 text-center text-sm text-slate-600">
        <p>VendorPriceIncreaseDefenseDesk</p>
      </footer>
    </main>
  )
}
