import { clsx } from 'clsx'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  GitCompare,
  Database,
  ListChecks,
  Upload,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Comparison', href: '/comparison', icon: GitCompare },
  { name: 'Websites', href: '/websites', icon: Database },
  { name: 'Runs', href: '/runs', icon: ListChecks },
  { name: 'Import', href: '/import', icon: Upload },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar({ onToggle: _onToggle }: { onToggle: () => void }) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={clsx(
        'fixed left-0 top-0 z-40 h-screen bg-dark-950 border-r border-dark-700 transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-dark-700">
        {!collapsed && (
          <NavLink to="/" className="flex items-center gap-2" aria-label="EdgeSight Analytics Home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-dark-50 text-lg">EdgeSight</span>
          </NavLink>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            'p-2 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors',
            collapsed && 'ml-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-dark-950',
                isActive
                  ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                  : 'text-dark-400 hover:text-dark-100 hover:bg-dark-800',
                collapsed && 'justify-center'
              )}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-3 border-t border-dark-700">
        <div className={clsx('text-xs text-center text-dark-500 transition-opacity', collapsed && 'opacity-0 pointer-events-none')}>
          EdgeSight Analytics v1.0.0
        </div>
      </div>
    </aside>
  )
}