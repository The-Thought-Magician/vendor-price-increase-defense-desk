interface StatProps {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'orange' | 'green' | 'red'
}

const valueTones = {
  default: 'text-white',
  orange: 'text-red-400',
  green: 'text-emerald-400',
  red: 'text-red-400',
}

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueTones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  )
}
