'use client'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {title && (
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-slate-800 px-5 py-4">{footer}</div>}
      </div>
    </div>
  )
}
