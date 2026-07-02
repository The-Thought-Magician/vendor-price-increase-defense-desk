import type { HTMLAttributes } from 'react'

type Tone = 'neutral' | 'orange' | 'green' | 'red' | 'amber' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-800 text-neutral-300 border-neutral-700',
  orange: 'bg-red-950/60 text-red-300 border-red-800/60',
  green: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  red: 'bg-red-950/60 text-red-300 border-red-800/60',
  amber: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  blue: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
}

export function Badge({ tone = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

// Convenience: map common verdict/status strings to a tone.
export function verdictTone(value?: string): Tone {
  const v = (value ?? '').toLowerCase()
  if (['breach', 'contested', 'overdue', 'rejected', 'error'].includes(v)) return 'red'
  if (['partial', 'under-review', 'at-risk', 'warning', 'pending'].includes(v)) return 'amber'
  if (['compliant', 'accepted', 'resolved', 'approved', 'done', 'won'].includes(v)) return 'green'
  if (['packet-ready', 'sent', 'logged'].includes(v)) return 'orange'
  return 'neutral'
}
