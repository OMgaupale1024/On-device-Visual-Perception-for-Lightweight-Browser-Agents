import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { clsx } from 'clsx'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={clsx(
        'w-full px-4 py-2.5 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500',
        'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
        'transition-all duration-200',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full px-4 py-2.5 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 placeholder-dark-500',
        'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
        'transition-all duration-200 resize-y min-h-[100px]',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={clsx(
        'w-full px-4 py-2.5 pr-10 bg-dark-800 border border-dark-600 rounded-lg text-dark-100',
        'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
        'transition-all duration-200 appearance-none bg-no-repeat bg-right',
        "bg-[url('data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%2394a3b8%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e')]",
        'bg-[length:1.5em_1.5em] bg-[right_0.5rem_center]',
        className
      )}
      {...props}
    />
  )
)
Select.displayName = 'Select'

export const Label = ({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={clsx('block text-sm font-medium text-dark-300 mb-1.5', className)} {...props}>
    {children}
  </label>
)