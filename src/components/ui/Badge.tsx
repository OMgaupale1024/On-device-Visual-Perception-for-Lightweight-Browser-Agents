import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'info'
  size?: 'sm' | 'md' | 'lg'
}

export const Badge = ({ className, variant = 'neutral', size = 'md', children, ...props }: BadgeProps) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full font-medium border'

  const variants = {
    success: 'bg-accent-500/20 text-accent-400 border-accent-500/30',
    warning: 'bg-warning-500/20 text-warning-400 border-warning-500/30',
    danger: 'bg-danger-500/20 text-danger-400 border-danger-500/30',
    neutral: 'bg-dark-700 text-dark-300 border-dark-600',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  }

  return (
    <span className={clsx(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  )
}