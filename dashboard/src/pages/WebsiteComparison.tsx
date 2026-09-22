import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronRight, BarChart2, Search, Filter, Download } from 'lucide-react'
import { Card, CardContent } from '@components/ui/Card'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { GroupedBarChart, RadarChart } from '@components/charts/Charts'
import { Input } from '@components/ui/Input'
import { useBenchmark } from '@services/BenchmarkContext'
import { getScoreColor, getScoreStatus, cn as clsx } from '@utils/format'

const COMPARISON_KEYS = [
  { key: 'visualScore', label: 'Visual', weight: 25, color: '#22c55e' },
  { key: 'piiF1', label: 'PII', weight: 20, color: '#3b82f6' },
  { key: 'redactionF1', label: 'Redaction', weight: 20, color: '#8b5cf6' },
  { key: 'resourceScore', label: 'Resources', weight: 20, color: '#f59e0b' },
  { key: 'latencyScore', label: 'Latency', weight: 15, color: '#06b6d4' },
]

export function WebsiteComparison() {
  const { state, exportBenchmarks } = useBenchmark()
  const [sortKey, setSortKey] = useState<'overallScore' | 'visualScore' | 'piiF1' | 'redactionF1' | 'resourceScore' | 'latencyScore' | 'piiLeakageRate'>('overallScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedWebsites, setSelectedWebsites] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const filteredBenchmarks = useMemo(() => {
    let result = state.benchmarks.filter((b) =>
      b.website.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.website.domain.toLowerCase().includes(searchTerm.toLowerCase())
    )

    result = [...result].sort((a, b) => {
      const aVal = a.aggregatedScores[sortKey]
      const bVal = b.aggregatedScores[sortKey]
      if (aVal === bVal) return 0
      return sortDir === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
    })

    return result
  }, [state.benchmarks, sortKey, sortDir, searchTerm])

  const comparisonData = useMemo(() =>
    state.benchmarks.map((b) => ({
      websiteName: b.website.name,
      visual: b.aggregatedScores.visualScore,
      pii: b.aggregatedScores.piiF1,
      redaction: b.aggregatedScores.redactionF1,
      resources: b.aggregatedScores.resourceScore,
      latency: b.aggregatedScores.latencyScore,
    })),
    [state.benchmarks]
  )

  const radarData = useMemo(() =>
    state.benchmarks.map((b) => ({
      name: b.website.name,
      Visual: b.aggregatedScores.visualScore,
      PII: b.aggregatedScores.piiF1,
      Redaction: b.aggregatedScores.redactionF1,
      Resources: b.aggregatedScores.resourceScore,
      Latency: b.aggregatedScores.latencyScore,
    })),
    [state.benchmarks]
  )

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const toggleWebsite = (id: string) => {
    setSelectedWebsites((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    )
  }

  const handleExport = async () => {
    await exportBenchmarks('csv')
  }

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse-soft flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-500/30 border-t-accent-500 rounded-full" />
          <p className="text-dark-400">Loading benchmarks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Website Comparison</h1>
          <p className="page-subtitle">Compare EdgeSight benchmark scores across websites</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {state.benchmarks.length === 0 && (
        <Card className="text-center py-16">
          <CardContent>
            <BarChart2 className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-dark-100 mb-2">No Benchmarks to Compare</h2>
            <p className="text-dark-400 mb-6 max-w-md mx-auto">
              Import benchmark data to compare websites. At least 2 websites are needed for comparison.
            </p>
            <Button onClick={() => window.location.href = '/import'} className="gap-2">
              <BarChart2 className="w-4 h-4" />
              Import Data
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <Input
                type="text"
                placeholder="Search websites..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-dark-400">
              <Filter className="w-4 h-4" />
              <span>{filteredBenchmarks.length} of {state.benchmarks.length} websites</span>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedWebsites.length === filteredBenchmarks.length && filteredBenchmarks.length > 0}
                      onChange={(e) => setSelectedWebsites(e.target.checked ? filteredBenchmarks.map((b) => b.id) : [])}
                      className="w-4 h-4 rounded border-dark-600 text-accent-500 focus:ring-accent-500"
                      aria-label="Select all"
                    />
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('overallScore')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">Overall Score</span>
                      {sortKey === 'overallScore' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('visualScore')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">Visual</span>
                      {sortKey === 'visualScore' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('piiF1')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">PII F1</span>
                      {sortKey === 'piiF1' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('redactionF1')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">Redaction</span>
                      {sortKey === 'redactionF1' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('resourceScore')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">Resources</span>
                      {sortKey === 'resourceScore' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('latencyScore')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">Latency</span>
                      {sortKey === 'latencyScore' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th>
                    <button
                      onClick={() => handleSort('piiLeakageRate')}
                      className="flex items-center gap-1 hover:text-dark-100 transition-colors"
                    >
                      <span className="font-semibold">PII Leakage</span>
                      {sortKey === 'piiLeakageRate' && (sortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
                    </button>
                  </th>
                  <th className="w-48">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredBenchmarks.map((benchmark) => {
                  const isSelected = selectedWebsites.includes(benchmark.id)
                  return (
                    <tr key={benchmark.id} className={clsx(isSelected && 'bg-accent-500/5')}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleWebsite(benchmark.id)}
                          className="w-4 h-4 rounded border-dark-600 text-accent-500 focus:ring-accent-500"
                        />
                      </td>
                      <td>
                        <Link to={`/website/${benchmark.id}`} className="font-medium text-dark-50 hover:text-accent-400 transition-colors flex items-center gap-2">
                          {benchmark.isSampleData && <Badge variant="warning" size="sm">SAMPLE</Badge>}
                          {benchmark.website.name}
                        </Link>
                        <div className="text-xs text-dark-500">{benchmark.website.domain}</div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            getScoreStatus(benchmark.aggregatedScores.visualScore) === 'Excellent' ? 'success' :
                            getScoreStatus(benchmark.aggregatedScores.visualScore) === 'Good' ? 'info' :
                            getScoreStatus(benchmark.aggregatedScores.visualScore) === 'Moderate' ? 'warning' : 'danger'
                          }
                        >
                          {benchmark.aggregatedScores.visualScore.toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            getScoreStatus(benchmark.aggregatedScores.piiF1) === 'Excellent' ? 'success' :
                            getScoreStatus(benchmark.aggregatedScores.piiF1) === 'Good' ? 'info' :
                            getScoreStatus(benchmark.aggregatedScores.piiF1) === 'Moderate' ? 'warning' : 'danger'
                          }
                        >
                          {benchmark.aggregatedScores.piiF1.toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            getScoreStatus(benchmark.aggregatedScores.redactionF1) === 'Excellent' ? 'success' :
                            getScoreStatus(benchmark.aggregatedScores.redactionF1) === 'Good' ? 'info' :
                            getScoreStatus(benchmark.aggregatedScores.redactionF1) === 'Moderate' ? 'warning' : 'danger'
                          }
                        >
                          {benchmark.aggregatedScores.redactionF1.toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            getScoreStatus(benchmark.aggregatedScores.resourceScore) === 'Excellent' ? 'success' :
                            getScoreStatus(benchmark.aggregatedScores.resourceScore) === 'Good' ? 'info' :
                            getScoreStatus(benchmark.aggregatedScores.resourceScore) === 'Moderate' ? 'warning' : 'danger'
                          }
                        >
                          {benchmark.aggregatedScores.resourceScore.toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            getScoreStatus(benchmark.aggregatedScores.latencyScore) === 'Excellent' ? 'success' :
                            getScoreStatus(benchmark.aggregatedScores.latencyScore) === 'Good' ? 'info' :
                            getScoreStatus(benchmark.aggregatedScores.latencyScore) === 'Moderate' ? 'warning' : 'danger'
                          }
                        >
                          {benchmark.aggregatedScores.latencyScore.toFixed(1)}%
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={benchmark.aggregatedScores.piiLeakageStatus === 'SAFE' ? 'success' : 'danger'}>
                          {benchmark.aggregatedScores.piiLeakageStatus}
                        </Badge>
                      </td>
                      <td>
                        <Link
                          to={`/website/${benchmark.id}`}
                          className="btn-ghost text-sm gap-1 px-2 py-1"
                        >
                          <ChevronRight className="w-3 h-3" />
                          View Details
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {state.benchmarks.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GroupedBarChart
              data={comparisonData}
              keys={COMPARISON_KEYS.map((k) => k.key.replace('Score', '').toLowerCase().replace('F1', '').replace('visual', 'visual').replace('pii', 'pii').replace('redaction', 'redaction').replace('resource', 'resources').replace('latency', 'latency'))}
              labels={Object.fromEntries(COMPARISON_KEYS.map((k) => [k.key.replace('Score', '').toLowerCase().replace('F1', '').replace('visual', 'visual').replace('pii', 'pii').replace('redaction', 'redaction').replace('resource', 'resources').replace('latency', 'latency'), k.label]))}
              colors={COMPARISON_KEYS.map((k) => k.color)}
              xKey="websiteName"
              title="Component Scores Comparison"
              height={400}
            />

            <RadarChart
              data={radarData}
              keys={['Visual', 'PII', 'Redaction', 'Resources', 'Latency']}
              labels={{ Visual: 'Visual', PII: 'PII', Redaction: 'Redaction', Resources: 'Resources', Latency: 'Latency' }}
              colors={['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4']}
              nameKey="name"
              title="Radar Comparison"
              height={400}
            />
          </div>

          {selectedWebsites.length > 1 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-dark-50 mb-4">
                  Detailed Comparison: {selectedWebsites.map((id) => state.benchmarks.find((b) => b.id === id)?.website.name).join(' vs ')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {COMPARISON_KEYS.map((comp) => (
                    <div key={comp.key} className="p-4 bg-dark-800/50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: comp.color }} />
                        <span className="font-medium text-dark-300">{comp.label}</span>
                        <Badge variant="neutral" size="sm">{comp.weight}%</Badge>
                      </div>
                      {selectedWebsites.map((id) => {
                        const benchmark = state.benchmarks.find((b) => b.id === id)
                        const score = benchmark?.aggregatedScores[comp.key as keyof typeof benchmark.aggregatedScores] as number || 0
                        return (
                          <div key={id} className="flex justify-between text-sm mb-1">
                            <span className="text-dark-400">{benchmark?.website.name}</span>
                            <span className={clsx('font-mono tabular-nums', getScoreColor(score))}>{score.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}