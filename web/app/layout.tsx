import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VendorPriceIncreaseDefenseDesk',
  description: 'Validate every supplier price-increase letter against contract clauses and published indices, then generate a data-backed pushback packet.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
