import { forwardRef, type HTMLAttributes } from 'react'
import { clsx } from 'clsx'

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('card', className)}
      {...props}
    >
      {children}
    </div>
  )
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('px-6 py-4 border-b border-dark-700/50', className)}
      {...props}
    >
      {children}
    </div>
  )
)
CardHeader.displayName = 'CardHeader'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('p-6', className)}
      {...props}
    >
      {children}
    </div>
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx('px-6 py-4 border-t border-dark-700/50 bg-dark-900/30 rounded-b-xl', className)}
      {...props}
    >
      {children}
    </div>
  )
)
CardFooter.displayName = 'CardFooter'