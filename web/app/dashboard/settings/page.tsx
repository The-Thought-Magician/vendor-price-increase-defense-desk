'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Badge, verdictTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'

interface Workspace {
  id: string
  name?: string
  default_currency?: string
  approval_threshold_cents?: number
  contest_over_ask_pct?: number
  settings?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

interface Plan {
  id?: string
  name?: string
  price_cents?: number
}

interface Subscription {
  id?: string
  plan_id?: string
  status?: string
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  current_period_end?: string | null
}

interface BillingResponse {
  subscription?: Subscription
  plan?: Plan
  stripeEnabled?: boolean
}

function fmtMoney(cents?: number): string {
  const v = (cents ?? 0) / 100
  return v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

type Banner = { kind: 'success' | 'error'; text: string } | null

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner>(null)

  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [billing, setBilling] = useState<BillingResponse | null>(null)

  // form state
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [thresholdDollars, setThresholdDollars] = useState('')
  const [contestPct, setContestPct] = useState('')
  const [saving, setSaving] = useState(false)

  // action busy flags
  const [seeding, setSeeding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  function syncForm(w: Workspace) {
    setName(w.name ?? '')
    setCurrency(w.default_currency ?? 'USD')
    setThresholdDollars(
      w.approval_threshold_cents != null ? String((w.approval_threshold_cents / 100).toFixed(2)) : '',
    )
    setContestPct(w.contest_over_ask_pct != null ? String(w.contest_over_ask_pct) : '')
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [wsRes, billRes] = await Promise.all([api.getWorkspace(), api.getBillingPlan()])
      const ws: Workspace = wsRes?.workspace ?? wsRes
      setWorkspace(ws)
      if (ws) syncForm(ws)
      setBilling(billRes ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function flash(b: Banner) {
    setBanner(b)
    if (b) setTimeout(() => setBanner(null), 4000)
  }

  async function saveWorkspace(e: React.FormEvent) {
    e.preventDefault()
    if (!workspace) return
    setSaving(true)
    setBanner(null)
    try {
      const thresholdCents = thresholdDollars.trim() === ''
        ? null
        : Math.round(parseFloat(thresholdDollars) * 100)
      const pct = contestPct.trim() === '' ? null : parseFloat(contestPct)
      const body: Record<string, unknown> = {
        name: name.trim(),
        default_currency: currency.trim() || 'USD',
        approval_threshold_cents: thresholdCents,
        contest_over_ask_pct: pct,
      }
      const res = await api.updateWorkspace(workspace.id, body)
      const ws: Workspace = res?.workspace ?? res
      setWorkspace(ws)
      if (ws) syncForm(ws)
      flash({ kind: 'success', text: 'Workspace settings saved.' })
    } catch (e) {
      flash({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  async function onSeed() {
    setSeeding(true)
    setBanner(null)
    try {
      await api.seedSampleData()
      flash({ kind: 'success', text: 'Sample data seeded. Browse Letters, Suppliers and Contracts to explore.' })
    } catch (e) {
      flash({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to seed sample data' })
    } finally {
      setSeeding(false)
    }
  }

  async function onReset() {
    setResetting(true)
    setBanner(null)
    try {
      await api.resetSampleData()
      setConfirmReset(false)
      flash({ kind: 'success', text: 'Sample data cleared from this workspace.' })
    } catch (e) {
      flash({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to reset sample data' })
    } finally {
      setResetting(false)
    }
  }

  async function onCheckout() {
    setBillingBusy(true)
    setBanner(null)
    try {
      const res = await api.startCheckout()
      if (res?.url) {
        window.location.href = res.url
      } else {
        flash({ kind: 'error', text: 'Checkout is not available right now.' })
      }
    } catch (e) {
      flash({ kind: 'error', text: e instanceof Error ? e.message : 'Billing is not configured (Stripe disabled).' })
    } finally {
      setBillingBusy(false)
    }
  }

  async function onPortal() {
    setBillingBusy(true)
    setBanner(null)
    try {
      const res = await api.openBillingPortal()
      if (res?.url) {
        window.location.href = res.url
      } else {
        flash({ kind: 'error', text: 'Billing portal is not available right now.' })
      }
    } catch (e) {
      flash({ kind: 'error', text: e instanceof Error ? e.message : 'Billing is not configured (Stripe disabled).' })
    } finally {
      setBillingBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  if (error) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <Button variant="secondary" onClick={load}>Retry</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    )
  }

  const sub = billing?.subscription
  const plan = billing?.plan
  const stripeEnabled = !!billing?.stripeEnabled
  const planName = plan?.name ?? sub?.plan_id ?? 'Free'
  const isPro = (sub?.plan_id ?? plan?.id ?? 'free').toLowerCase() === 'pro'

  return (
    <div className="space-y-6">
      <Header />

      {banner && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'success'
              ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
              : 'border-red-800/60 bg-red-950/40 text-red-300'
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Workspace settings */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-200">Workspace</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Defaults used across letters, approvals and contest thresholds.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={saveWorkspace} className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Workspace name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Procurement Team"
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Default currency">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={inputClass}
                >
                  {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Approval threshold"
                hint="Letters with annual impact above this require an approval workflow."
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500">$</span>
                  <input
                    value={thresholdDollars}
                    onChange={(e) => setThresholdDollars(e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="10000.00"
                    className={inputClass}
                  />
                </div>
              </Field>
              <Field
                label="Contest over-ask threshold (%)"
                hint="Auto-flag increases that exceed the entitled amount by this percent."
              >
                <div className="flex items-center gap-2">
                  <input
                    value={contestPct}
                    onChange={(e) => setContestPct(e.target.value)}
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="2.0"
                    className={inputClass}
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
              <div className="text-xs text-neutral-500">
                {workspace?.created_at && <>Created {fmtDate(workspace.created_at)}. </>}
                {workspace?.updated_at && <>Last updated {fmtDate(workspace.updated_at)}.</>}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => workspace && syncForm(workspace)}
                  disabled={saving}
                >
                  Revert
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sample data */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-neutral-200">Sample Data</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Populate the workspace with example suppliers, contracts, indices and increase letters.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-sm text-neutral-400">
              Seeding creates realistic procurement data so you can explore clause checks, index
              validation and pushback packets without manual entry. Resetting removes seeded records
              from this workspace.
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onSeed} disabled={seeding || resetting}>
                {seeding ? 'Seeding...' : 'Seed sample data'}
              </Button>
              {!confirmReset ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirmReset(true)}
                  disabled={seeding || resetting}
                >
                  Reset sample data
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-300">Clear seeded data?</span>
                  <Button variant="danger" onClick={onReset} disabled={resetting}>
                    {resetting ? 'Clearing...' : 'Yes, reset'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmReset(false)}
                    disabled={resetting}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-200">Billing & Plan</h2>
              <Badge tone={isPro ? 'green' : 'neutral'}>{planName}</Badge>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Manage your subscription and payment method.
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Plan</dt>
                <dd className="mt-1 font-medium text-neutral-200">{planName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Price</dt>
                <dd className="mt-1 font-medium text-neutral-200">
                  {plan?.price_cents ? `${fmtMoney(plan.price_cents)}/mo` : 'Free'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Status</dt>
                <dd className="mt-1">
                  <Badge tone={verdictTone(sub?.status)}>{sub?.status ?? 'active'}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-neutral-500">Renews</dt>
                <dd className="mt-1 font-medium text-neutral-200">{fmtDate(sub?.current_period_end)}</dd>
              </div>
            </dl>

            {!stripeEnabled && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 px-4 py-3 text-xs text-neutral-500">
                Stripe is not configured for this deployment. All features are available on the free
                plan; upgrade and portal actions require Stripe keys.
              </div>
            )}

            <div className="flex flex-wrap gap-3 border-t border-neutral-800 pt-4">
              {!isPro && (
                <Button onClick={onCheckout} disabled={billingBusy || !stripeEnabled}>
                  {billingBusy ? 'Opening...' : 'Upgrade to Pro'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={onPortal}
                disabled={billingBusy || !stripeEnabled}
              >
                {billingBusy ? 'Opening...' : 'Manage billing'}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-red-500/60 focus:outline-none focus:ring-1 focus:ring-red-500/60'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-neutral-600">{hint}</span>}
    </label>
  )
}

function Header() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Workspace defaults, sample data and billing.
        </p>
      </div>
    </div>
  )
}
