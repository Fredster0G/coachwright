import { useEffect, useRef, type ReactNode } from 'react'
import { create } from 'zustand'
import { X } from 'lucide-react'
import { IconButton } from './controls'

// ============ Dialog (native <dialog>, accessible) ============
export function Dialog({ open, onClose, title, children, width = 440 }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      style={{ width, maxWidth: 'calc(100vw - 32px)' }}
      className="rounded-card border border-line bg-surface p-0 text-ink shadow-modal backdrop:bg-iron-950/40"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  )
}

// ============ Toast ============
type Toast = { id: number; text: string; tone: 'default' | 'error' }
let toastSeq = 0
const useToastStore = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++toastSeq
    set(s => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), 3600)
  },
  drop: (id) => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}))

// eslint-disable-next-line react-refresh/only-export-components
export const toast = (text: string) => useToastStore.getState().push({ text, tone: 'default' })
// eslint-disable-next-line react-refresh/only-export-components
export const toastError = (text: string) => useToastStore.getState().push({ text, tone: 'error' })

export function Toaster() {
  const toasts = useToastStore(s => s.toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 end-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-ctl border px-3 py-2 text-sm shadow-modal ${
            t.tone === 'error'
              ? 'border-signal-600/30 bg-surface text-signal-600'
              : 'border-line bg-iron-950 text-white dark:bg-surface dark:text-ink'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

// ============ Tabs ============
/** Scrolls sideways when the tabs don't fit (a client page has 11 — on a
 *  phone the last ones used to be clipped and unreachable), and keeps the
 *  active tab in view. */
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Scroll the strip only — scrollIntoView would also scroll the page
    // vertically when the tabs start below the fold.
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !el) return
    if (el.offsetLeft < list.scrollLeft) list.scrollLeft = el.offsetLeft
    else if (el.offsetLeft + el.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = el.offsetLeft + el.offsetWidth - list.clientWidth
    }
  }, [active])
  return (
    <div ref={listRef} role="tablist" className="relative flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.id ? 'border-verde-600 text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ============ Table ============
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-start text-2xs font-medium uppercase tracking-wide text-faint [&>th]:px-3 [&>th]:py-2">
            {head}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr:hover]:bg-surface2 [&>tr>td]:px-3 [&>tr>td]:py-2">
          {children}
        </tbody>
      </table>
    </div>
  )
}
