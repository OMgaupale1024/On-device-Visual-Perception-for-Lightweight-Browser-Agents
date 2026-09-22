import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useState } from 'react'
import { clsx } from 'clsx'

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-dark-950 flex">
      <Sidebar onToggle={() => setSidebarOpen(false)} />
      <div className={clsx('flex-1 flex flex-col min-w-0', sidebarOpen ? 'lg:pl-64' : 'lg:pl-16')}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-dark-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}