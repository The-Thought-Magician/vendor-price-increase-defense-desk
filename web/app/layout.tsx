import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'VendorPriceIncreaseDefenseDesk',
  description: 'Validate every supplier price-increase letter against contract clauses and published indices, then generate a data-backed pushback packet.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-neutral-950 text-neutral-100 min-h-screen antialiased font-sans">{children}</body>
    </html>
  )
}
