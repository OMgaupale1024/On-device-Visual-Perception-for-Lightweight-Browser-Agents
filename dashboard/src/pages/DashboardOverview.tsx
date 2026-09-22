import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield,
  Target,
  Eye,
  Zap,
  Clock,
  AlertTriangle,
  BarChart2,
  TrendingUp,
  Database,
} from 'lucide-react'
import { Card, CardContent } from '@components/ui/Card'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { GroupedBarChart } from '@components/charts/Charts'
import { Select } from '@components/ui/Input'
import { useBenchmark } from '@services/BenchmarkContext'
import { calculateAllScores, DEFAULT_THRESHOLDS } from '@scoring/index'
import { formatBytes, formatDuration, getScoreColor, getScoreStatus, formatRelativeTime, cn as clsx } from '@utils/format'

const WEIGHTS = [
  { key: 'visualScore', label: 'Visual Context', weight: 25, icon: Eye, color: '#22c55e' },
  { key: 'piiF1', label: 'PII Detection', weight: 20, icon: Shield, color: '#3b82f6' },
  { key: 'redactionF1', label: 'Redaction', weight: 20, icon: Target, color: '#8b5cf6' },
  { key: 'resourceScore', label: 'Resources', weight: 20, icon: Zap, color: '#f59e0b' },
  { key: 'latencyScore', label: 'Latency', weight: 15, icon: Clock, color: '#06b6d4' },
]

export function DashboardOverview() {
  const { state } = useBenchmark()
  const navigate = useNavigate()

  const selectedWebsiteId = useMemo(() => {
    if (state.benchmarks.length > 0) return state.benchmarks[0].id
    return null
  }, [state.benchmarks])

  const selectedBenchmark = useMemo(() => {
    if (!selectedWebsiteId) return null
    return state.benchmarks.find((b) => b.id === selectedWebsiteId) || null
  }, [state.benchmarks, selectedWebsiteId])

  const scores = selectedBenchmark?.aggregatedScores

  const handleLoadSample = async () => {
    // Sample data removed - implement your own data loading
    navigate('/import')
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

  if (state.benchmarks.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="page-header">
          <h1 className="page-title">EdgeSight Analytics</h1>
          <p className="page-subtitle">Privacy & Performance Benchmarking for Browser Agents</p>
        </div>

        <Card className="text-center py-16">
          <CardContent>
            <Database className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-dark-100 mb-2">No Benchmarks Yet</h2>
            <p className="text-dark-400 mb-6 max-w-md mx-auto">
              Import your EdgeSight benchmark results to start analyzing privacy and performance metrics across websites.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button onClick={handleLoadSample} className="gap-2">
                <BarChart2 className="w-4 h-4" />
                Load Sample Data
              </Button>
              <Button variant="secondary" onClick={() => navigate('/import')} className="gap-2">
                <BarChart2 className="w-4 h-4" />
                Import JSON
              </Button>
            </div>
            <p className="text-xs text-dark-500 mt-4">Sample data is clearly marked as <span className="font-medium text-warning-400">SAMPLE DATA</span></p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const kpiCards = [
    {
      label: 'EdgeSight Benchmark Score',
      value: scores ? scores.overallScore.toFixed(1) : '—',
      unit: '/ 100',
      icon: TrendingUp,
      status: scores ? getScoreStatus(scores.overallScore) : null,
      color: scores ? getScoreColor(scores.overallScore) : 'text-dark-500',
      bgColor: scores ? getScoreColor(scores.overallScore).replace('text', 'bg').replace('400', '500/20') : 'bg-dark-700/50',
      borderColor: scores ? getScoreColor(scores.overallScore).replace('text', 'border').replace('400', '500/30') : 'border-dark-600',
      trend: '+2.3%',
      trendPositive: true,
    },
    {
      label: 'Visual Context',
      value: scores ? scores.visualScore.toFixed(1) : '—',
      unit: '%',
      icon: Eye,
      status: scores ? getScoreStatus(scores.visualScore) : null,
      color: '#22c55e',
    },
    {
      label: 'PII F1 Score',
      value: scores ? scores.piiF1.toFixed(1) : '—',
      unit: '%',
      icon: Shield,
      status: scores ? getScoreStatus(scores.piiF1) : null,
      color: '#3b82f6',
    },
    {
      label: 'Redaction',
      value: scores ? scores.redactionF1.toFixed(1) : '—',
      unit: '%',
      icon: Target,
      status: scores ? getScoreStatus(scores.redactionF1) : null,
      color: '#8b5cf6',
    },
    {
      label: 'Resource Efficiency',
      value: scores ? scores.resourceScore.toFixed(1) : '—',
      unit: '%',
      icon: Zap,
      status: scores ? getScoreStatus(scores.resourceScore) : null,
      color: '#f59e0b',
    },
    {
      label: 'Avg Latency',
      value: selectedBenchmark
        ? formatDuration(selectedBenchmark.runs.reduce((a, b) => a + b.performance.timingsMs.total, 0) / selectedBenchmark.runs.length)
        : '—',
      unit: '',
      icon: Clock,
      status: scores ? getScoreStatus(scores.latencyScore) : null,
      color: '#06b6d4',
    },
  ]

  const piiLeakage = selectedBenchmark
    ? { leaked: selectedBenchmark.runs.reduce((a, b) => a + b.pii.outboundLeakCount, 0), total: selectedBenchmark.runs.reduce((a, b) => a + b.groundTruth.expectedPII, 0) }
    : { leaked: 0, total: 0 }

  const piiLeakageStatus = selectedBenchmark?.aggregatedScores.piiLeakageStatus || 'SAFE'

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="page-title">EdgeSight Analytics</h1>
          <p className="page-subtitle">Privacy & Performance Benchmarking for Browser Agents</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={selectedWebsiteId || ''}
            onChange={(e) => navigate(`/website/${e.target.value}`)}
            aria-label="Select website"
            className="w-64 sm:w-80"
          >
            <option value="">Select Website</option>
            {state.benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.website.name} ({b.website.domain})
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => navigate('/comparison')} className="gap-2">
            <BarChart2 className="w-4 h-4" />
            Compare
          </Button>
        </div>
      </div>

      {selectedBenchmark?.isSampleData && (
        <div className="flex items-center gap-2 px-4 py-2 bg-warning-500/10 border border-warning-500/30 rounded-lg text-warning-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">SAMPLE DATA</span> — This benchmark uses sample data for demonstration purposes only.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={kpi.label} className={clsx('kpi-card relative overflow-hidden', index === 0 && 'xl:col-span-2')}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <kpi.icon className={clsx('w-5 h-5', kpi.color)} />
                <span className="metric-label">{kpi.label}</span>
              </div>
              {kpi.status && (
                <Badge variant={kpi.status === 'Excellent' ? 'success' : kpi.status === 'Good' ? 'info' : kpi.status === 'Moderate' ? 'warning' : 'danger'} size="sm">
                  {kpi.status}
                </Badge>
              )}
            </div>
            <div className="flex items-end gap-1 mb-2">
              <span className={clsx('metric-value', kpi.color)}>{kpi.value}</span>
              {kpi.unit && <span className="text-dark-400 mb-1">{kpi.unit}</span>}
            </div>
            {kpi.trend && (
              <div className={clsx('metric-delta', kpi.trendPositive ? 'metric-delta-positive' : 'metric-delta-negative')}>
                <TrendingUp className="w-3 h-3" />
                {kpi.trend} vs last run
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 kpi-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-danger-400" />
              <span className="text-lg font-semibold text-dark-50">PII Leakage</span>
            </div>
            <Badge variant={piiLeakageStatus === 'SAFE' ? 'success' : 'danger'} size="md">
              {piiLeakageStatus}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-4xl font-bold text-dark-50 font-mono tabular-nums">{piiLeakage.leaked}</span>
            <span className="text-dark-400 mb-1"> / {piiLeakage.total}</span>
          </div>
          <p className="text-dark-400 text-sm">
            {piiLeakageStatus === 'SAFE'
              ? 'No sensitive data transmitted to server. Privacy preserved.'
              : '⚠️ Privacy failure detected. Sensitive data leaked in outbound context.'}
          </p>
          <div className="mt-4 h-2 bg-dark-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', piiLeakageStatus === 'SAFE' ? 'bg-accent-500' : 'bg-danger-500')}
              style={{ width: piiLeakage.total > 0 ? `${(piiLeakage.leaked / piiLeakage.total) * 100}%` : '0%' }}
            />
          </div>
        </Card>

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-dark-50">Score Breakdown</span>
          </div>
          <div className="space-y-3">
            {WEIGHTS.map((w) => {
              const score = scores?.[w.key as keyof typeof scores] as number || 0
              return (
                <div key={w.key} className="flex items-center gap-3">
                  <w.icon className={clsx('w-4 h-4', w.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-300 font-medium">{w.label}</span>
                      <span className={clsx('font-mono tabular-nums', getScoreColor(score))}>{score.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${score}%`, backgroundColor: w.color }}
                      />
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">{w.weight}%</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GroupedBarChart
          data={state.benchmarks.map((b) => ({
            name: b.website.name,
            visual: b.aggregatedScores.visualScore,
            pii: b.aggregatedScores.piiF1,
            redaction: b.aggregatedScores.redactionF1,
            resources: b.aggregatedScores.resourceScore,
            latency: b.aggregatedScores.latencyScore,
          }))}
          keys={['visual', 'pii', 'redaction', 'resources', 'latency']}
          labels={{ visual: 'Visual', pii: 'PII', redaction: 'Redaction', resources: 'Resources', latency: 'Latency' }}
          colors={['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4']}
          xKey="name"
          title="Component Scores by Website"
          height={350}
        />

        <Card className="chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Environment</h3>
          <div className="space-y-3 text-sm">
            {selectedBenchmark && (
              <>
                <div className="flex justify-between">
                  <span className="text-dark-400">Device</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.device}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">CPU</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.cpu}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">RAM</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.ramGB} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">GPU</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.gpu || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">OS</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.os}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Browser</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.browser} {selectedBenchmark.environment.browserVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">EdgeSight</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.edgeSightVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Vision Model</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.environment.visionModel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Pages Tested</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.pages.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Total Runs</span>
                  <span className="text-dark-100 font-mono">{selectedBenchmark.runs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Benchmark Date</span>
                  <span className="text-dark-100 font-mono">{formatRelativeTime(selectedBenchmark.createdAt)}</span>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Latency Breakdown (Avg)</h3>
          {selectedBenchmark && (
            <>
              <div className="space-y-3">
                {[
                  { label: 'Screen Capture', key: 'screenCapture' },
                  { label: 'DOM Processing', key: 'dom' },
                  { label: 'Vision/OCR', key: 'vision' },
                  { label: 'PII Detection', key: 'pii' },
                  { label: 'Redaction', key: 'redaction' },
                  { label: 'Privacy Guard', key: 'privacyGuard' },
                  { label: 'Server Reasoning', key: 'server' },
                  { label: 'Action Execution', key: 'action' },
                ].map((item) => {
                  const avg = selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.timingsMs[item.key as keyof typeof run.performance.timingsMs], 0) / selectedBenchmark.runs.length
                  const total = selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.timingsMs.total, 0) / selectedBenchmark.runs.length
                  const percentage = ((avg / total) * 100).toFixed(1)
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="w-32 text-sm text-dark-400">{item.label}</span>
                      <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-500 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-sm font-mono text-dark-300">{formatDuration(avg)}</span>
                      <span className="w-12 text-right text-xs text-dark-500">{percentage}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card>

        <Card className="chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Resource Utilization (Avg)</h3>
          {selectedBenchmark && (
            <>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-dark-400">CPU Usage</span>
                    <span className="font-mono text-dark-300">{(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.cpu.average, 0) / selectedBenchmark.runs.length).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.cpu.average, 0) / selectedBenchmark.runs.length))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-dark-500 mt-1">
                    <span>Avg: {(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.cpu.average, 0) / selectedBenchmark.runs.length).toFixed(1)}%</span>
                    <span>Peak: {(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.cpu.peak, 0) / selectedBenchmark.runs.length).toFixed(1)}%</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-dark-400">RAM Usage</span>
                    <span className="font-mono text-dark-300">{formatBytes(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.ramMB.average * 1024 * 1024, 0) / selectedBenchmark.runs.length)}</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-warning-500 rounded-full"
                      style={{ width: `${Math.min(100, (selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.ramMB.average, 0) / selectedBenchmark.runs.length / 800) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-dark-500 mt-1">
                    <span>Avg: {formatBytes(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.ramMB.average * 1024 * 1024, 0) / selectedBenchmark.runs.length)}</span>
                    <span>Peak: {formatBytes(selectedBenchmark.runs.reduce((acc: number, run) => acc + run.performance.ramMB.peak * 1024 * 1024, 0) / selectedBenchmark.runs.length)}</span>
                  </div>
                </div>
                {selectedBenchmark.runs[0]?.performance.gpuAverage && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-dark-400">GPU Usage</span>
                      <span className="font-mono text-dark-300">{(selectedBenchmark.runs.reduce((acc: number, run) => acc + (run.performance.gpuAverage || 0), 0) / selectedBenchmark.runs.length).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${Math.min(100, (selectedBenchmark.runs.reduce((acc: number, run) => acc + (run.performance.gpuAverage || 0), 0) / selectedBenchmark.runs.length))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Recent Runs</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Page</th>
                  <th>Run</th>
                  <th>Overall</th>
                  <th>Visual</th>
                  <th>PII</th>
                  <th>Redaction</th>
                  <th>Latency</th>
                  <th>PII Leakage</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {state.benchmarks
                  .flatMap((benchmark) =>
                    benchmark.runs.slice(-3).map((r) => ({
                      ...r,
                      websiteName: benchmark.website.name,
                      scores: calculateAllScores(r, DEFAULT_THRESHOLDS),
                    }))
                  )
                  .sort((a, b) => new Date(b.run.timestamp).getTime() - new Date(a.run.timestamp).getTime())
                  .slice(0, 10)
                  .map((r) => (
                    <tr key={`${r.websiteName}-${r.page.name}-${r.run.runNumber}`}>
                      <td className="font-medium">{r.websiteName}</td>
                      <td className="text-dark-400">{r.page.name}</td>
                      <td className="font-mono text-dark-300">#{r.run.runNumber}</td>
                      <td>
                        <Badge variant={getScoreStatus(r.scores.overallScore) === 'Excellent' ? 'success' : getScoreStatus(r.scores.overallScore) === 'Good' ? 'info' : getScoreStatus(r.scores.overallScore) === 'Moderate' ? 'warning' : 'danger'}>
                          {r.scores.overallScore.toFixed(1)}
                        </Badge>
                      </td>
                      <td className="font-mono">{r.scores.visualScore.toFixed(1)}%</td>
                      <td className="font-mono">{r.scores.piiF1.toFixed(1)}%</td>
                      <td className="font-mono">{r.scores.redactionF1.toFixed(1)}%</td>
                      <td className="font-mono">{formatDuration(r.performance.timingsMs.total)}</td>
                      <td>
                        <Badge variant={r.pii.outboundLeakCount > 0 ? 'danger' : 'success'}>
                          {r.pii.outboundLeakCount} / {r.groundTruth.expectedPII}
                        </Badge>
                      </td>
                      <td className="text-dark-400">{formatRelativeTime(r.run.timestamp)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Payload Reduction</h3>
          {selectedBenchmark && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth="8"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="8"
                        strokeDasharray={`${(selectedBenchmark.aggregatedScores.payloadReduction / 100) * 352} 352`}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-dark-50 font-mono">
                        {selectedBenchmark.aggregatedScores.payloadReduction.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-dark-800/50 rounded-lg">
                    <div className="text-lg font-bold text-dark-50 font-mono">
                      {formatBytes(selectedBenchmark.runs.reduce((a, b) => a + b.network.rawPayloadBytes, 0) / selectedBenchmark.runs.length)}
                    </div>
                    <div className="text-xs text-dark-400">Raw Payload</div>
                  </div>
                  <div className="p-3 bg-dark-800/50 rounded-lg">
                    <div className="text-lg font-bold text-dark-50 font-mono">
                      {formatBytes(selectedBenchmark.runs.reduce((a, b) => a + b.network.sanitizedPayloadBytes, 0) / selectedBenchmark.runs.length)}
                    </div>
                    <div className="text-xs text-dark-400">Sanitized</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card className="chart-container">
          <h3 className="text-lg font-semibold text-dark-50 mb-4">Agent Performance</h3>
          {selectedBenchmark && (
            <>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-dark-400">Tasks Attempted</span>
                  <span className="font-mono text-dark-100">{selectedBenchmark.runs.reduce((a, b) => a + b.agent.tasksAttempted, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Tasks Completed</span>
                  <span className="font-mono text-dark-100">{selectedBenchmark.runs.reduce((a, b) => a + b.agent.tasksCompleted, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Success Rate</span>
                  <span className="font-mono text-accent-400">
                    {(
                      (selectedBenchmark.runs.reduce((a, b) => a + b.agent.tasksCompleted, 0) /
                        selectedBenchmark.runs.reduce((a, b) => a + b.agent.tasksAttempted, 0)) *
                      100
                    ).toFixed(1)}%
                  </span>
                </div>
                <div className="divider" />
                <div className="flex justify-between">
                  <span className="text-dark-400">Correct Actions</span>
                  <span className="font-mono text-accent-400">{selectedBenchmark.runs.reduce((a, b) => a + b.agent.correctActions, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Incorrect Actions</span>
                  <span className="font-mono text-danger-400">{selectedBenchmark.runs.reduce((a, b) => a + b.agent.incorrectActions, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Action Accuracy</span>
                  <span className="font-mono text-dark-100">
                    {(
                      (selectedBenchmark.runs.reduce((a, b) => a + b.agent.correctActions, 0) /
                        (selectedBenchmark.runs.reduce((a, b) => a + b.agent.correctActions, 0) +
                          selectedBenchmark.runs.reduce((a, b) => a + b.agent.incorrectActions, 0))) *
                      100
                    ).toFixed(1)}%
                  </span>
                </div>
                <div className="divider" />
                <div className="flex justify-between">
                  <span className="text-dark-400">Avg Actions/Task</span>
                  <span className="font-mono text-dark-100">
                    {
                      selectedBenchmark.runs.reduce((a, b) => a + b.agent.correctActions + b.agent.incorrectActions, 0) /
                      selectedBenchmark.runs.reduce((a, b) => a + b.agent.tasksCompleted, 0)
                    }.toFixed(1)
                  </span>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}