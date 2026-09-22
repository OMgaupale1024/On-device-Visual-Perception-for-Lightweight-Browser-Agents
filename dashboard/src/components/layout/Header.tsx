import { Menu, Sun, Moon, Download, Bell } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { useBenchmark } from '@services/BenchmarkContext'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const [darkMode, setDarkMode] = useState(true)
  const { state, exportBenchmarks } = useBenchmark()

  const handleExport = async (format: 'json' | 'csv') => {
    await exportBenchmarks(format)
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-dark-950/80 backdrop-blur-sm border-b border-dark-700 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded-lg border border-dark-700">
          <span className="font-bold text-dark-50 text-sm">EdgeSight Analytics</span>
          <Badge variant="info" size="sm">SIH26171</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleExport('json')} aria-label="Export JSON">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export JSON</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleExport('csv')} aria-label="Export CSV">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={() => setDarkMode(!darkMode)} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        <Button variant="ghost" size="sm" aria-label="Notifications">
          <Bell className="w-5 h-5" />
        </Button>

        <div className="w-px h-6 bg-dark-700 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2 px-3 py-1.5 bg-dark-900 rounded-lg border border-dark-700">
          <Badge variant={state.benchmarks.length > 0 ? 'success' : 'neutral'} size="sm">
            {state.benchmarks.length} Websites
          </Badge>
        </div>
      </div>
    </header>
  )
}