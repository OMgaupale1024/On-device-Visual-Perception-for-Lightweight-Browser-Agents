import React, { useState, useCallback, createContext, useContext } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { clsx } from 'clsx'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-accent-400" />,
    error: <AlertCircle className="w-5 h-5 text-danger-400" />,
    warning: <AlertCircle className="w-5 h-5 text-warning-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  }

  const styles = {
    success: 'border-accent-500/30 bg-accent-500/10',
    error: 'border-danger-500/30 bg-danger-500/10',
    warning: 'border-warning-500/30 bg-warning-500/10',
    info: 'border-blue-500/30 bg-blue-500/10',
  }

  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg border shadow-xl min-w-[300px] max-w-md animate-slide-up',
        styles[toast.type]
      )}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-dark-50">{toast.title}</p>
        {toast.message && <p className="text-sm text-dark-400 mt-0.5">{toast.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 p-1 text-dark-500 hover:text-dark-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function Toaster({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}