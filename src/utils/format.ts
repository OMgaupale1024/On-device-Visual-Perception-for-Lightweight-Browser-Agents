export function formatNumber(value: number, decimals = 1): string {
  if (value >= 1000000) {
    return (value / 1000000).toFixed(decimals) + 'M'
  }
  if (value >= 1000) {
    return (value / 1000).toFixed(decimals) + 'K'
  }
  return value.toFixed(decimals)
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(1)
  return `${minutes}m ${seconds}s`
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}

export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-accent-400'
  if (score >= 80) return 'text-blue-400'
  if (score >= 70) return 'text-warning-400'
  return 'text-danger-400'
}

export function getScoreBgColor(score: number): string {
  if (score >= 90) return 'bg-accent-500/20 border-accent-500/30'
  if (score >= 80) return 'bg-blue-500/20 border-blue-500/30'
  if (score >= 70) return 'bg-warning-500/20 border-warning-500/30'
  return 'bg-danger-500/20 border-danger-500/30'
}

export function getScoreStatus(score: number): 'Excellent' | 'Good' | 'Moderate' | 'Needs Improvement' {
  if (score >= 90) return 'Excellent'
  if (score >= 80) return 'Good'
  if (score >= 70) return 'Moderate'
  return 'Needs Improvement'
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export { clsx } from 'clsx'