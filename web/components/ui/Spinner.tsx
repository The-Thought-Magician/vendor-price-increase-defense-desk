export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-orange-500 ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

export function PageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  )
}
