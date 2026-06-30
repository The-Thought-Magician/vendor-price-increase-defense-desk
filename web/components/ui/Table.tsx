import type { ReactNode } from 'react'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-full text-left text-sm">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-slate-800 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
      {children}
    </thead>
  )
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-800/70">{children}</tbody>
}

export function TR({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`hover:bg-slate-900/50 ${className}`}>{children}</tr>
}

export function TH({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>
}

export function TD({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-slate-300 ${className}`}>{children}</td>
}
