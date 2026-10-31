import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react'

// ============ Button ============
type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md'

const variantCls: Record<Variant, string> = {
  primary: 'bg-verde-600 text-white hover:bg-verde-700 border border-transparent',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface2',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface border border-transparent',
  destructive: 'bg-signal-600 text-white hover:brightness-95 border border-transparent',
}
const sizeCls: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', ...rest }, ref) => (
    <button
      ref={ref}
      className={`inline-flex select-none items-center justify-center rounded-ctl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${variantCls[variant]} ${sizeCls[size]} ${className}`}
      {...rest}
    />
  ),
)
Button.displayName = 'Button'

export function IconButton({ label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-surface hover:text-ink ${className}`}
      {...rest}
    />
  )
}

// ============ Fields ============
export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-muted">
      {children}
      {hint && <span className="font-normal text-faint">{hint}</span>}
    </span>
  )
}

const fieldBase =
  'w-full rounded-ctl border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-faint focus:border-verde-600 focus:outline-none disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  // `data-autofocus` mirrors autoFocus for Dialog: React's autoFocus fires
  // while a <dialog> is still closed, so it's lost when showModal() runs.
  ({ className = '', ...rest }, ref) => (
    <input ref={ref} className={`${fieldBase} h-9 ${className}`} data-autofocus={rest.autoFocus || undefined} {...rest} />
  ),
)
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = '', ...rest }, ref) => (
    <select ref={ref} className={`${fieldBase} h-9 pe-8 ${className}`} {...rest} />
  ),
)
Select.displayName = 'Select'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...rest }, ref) => (
    <textarea ref={ref} className={`${fieldBase} min-h-[72px] py-2 ${className}`} {...rest} />
  ),
)
Textarea.displayName = 'Textarea'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  )
}
