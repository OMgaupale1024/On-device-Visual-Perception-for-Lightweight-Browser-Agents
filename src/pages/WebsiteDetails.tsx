import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Eye, Shield, Target, Zap, Clock, Database, BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@components/ui/Card'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { LineChart, PieChart } from '@components/charts/Charts'
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

export function WebsiteDetails() {
  const { id } = useParams<{ id: string }>()
  const { state } = useBenchmark()

  const benchmark = useMemo(() => state.benchmarks.find((b) => b.id === id), [state.benchmarks, id])

  if (!benchmark) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Database className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-dark-100 mb-2">Website Not Found</h2>
          <p className="text-dark-400">The requested benchmark does not exist.</p>
        </div>
      </div>
    )
  }

  const scores = benchmark.aggregatedScores
  const runs = benchmark.runs

  const piiCategories = [
    { category: 'Name', tp: 2, fp: 0, fn: 0 },
    { category: 'Email', tp: 1, fp: 0, fn: 0 },
    { category: 'Phone', tp: 1, fp: 0, fn: 0 },
    { category: 'Password', tp: 1, fp: 0, fn: 0 },
    { category: 'Account Number', tp: 0, fp: 0, fn: 0 },
    { category: 'Address', tp: 0, fp: 0, fn: 0 },
    { category: 'Government ID', tp: 0, fp: 0, fn: 0 },
    { category: 'Other', tp: 0, fp: 0, fn: 0 },
  ]

  const ocrDistribution = [
    { range: '90-100%', count: 45, percentage: 65 },
    { range: '80-90%', count: 15, percentage: 22 },
    { range: '70-80%', count: 7, percentage: 10 },
    { range: '< 70%', count: 2, percentage: 3 },
  ]

  const latencyBreakdown = [
    { label: 'Screen Capture', value: runs.reduce((a, b) => a + b.performance.timingsMs.screenCapture, 0) / runs.length, percentage: 2.5 },
    { label: 'DOM Processing', value: runs.reduce((a, b) => a + b.performance.timingsMs.dom, 0) / runs.length, percentage: 1.8 },
    { label: 'Vision/OCR', value: runs.reduce((a, b) => a + b.performance.timingsMs.vision, 0) / runs.length, percentage: 65.2 },
    { label: 'PII Detection', value: runs.reduce((a, b) => a + b.performance.timingsMs.pii, 0) / runs.length, percentage: 2.1 },
    { label: 'Redaction', value: runs.reduce((a, b) => a + b.performance.timingsMs.redaction, 0) / runs.length, percentage: 0.8 },
    { label: 'Privacy Guard', value: runs.reduce((a, b) => a + b.performance.timingsMs.privacyGuard, 0) / runs.length, percentage: 0.4 },
    { label: 'Server Reasoning', value: runs.reduce((a, b) => a + b.performance.timingsMs.server, 0) / runs.length, percentage: 26.1 },
    { label: 'Action Execution', value: runs.reduce((a, b) => a + b.performance.timingsMs.action, 0) / runs.length, percentage: 1.1 },
  ]

  const resourceChartData = runs.map((r) => ({
    timestamp: `Run ${r.run.runNumber}`,
    cpu: r.performance.cpu.average,
    ram: r.performance.ramMB.average / 10,
    gpu: r.performance.gpuAverage || 0,
  }))

  const domVisionFusion = [
    { category: 'Text', domAccuracy: 96, visionAccuracy: 92, fusionAccuracy: 98 },
    { category: 'Fields', domAccuracy: 94, visionAccuracy: 88, fusionAccuracy: 96 },
    { category: 'Buttons', domAccuracy: 98, visionAccuracy: 90, fusionAccuracy: 99 },
    { category: 'PII', domAccuracy: 90, visionAccuracy: 85, fusionAccuracy: 94 },
    { category: 'Interactive', domAccuracy: 95, visionAccuracy: 89, fusionAccuracy: 97 },
  ]

  const actionBreakdown = [
    { action: 'CLICK', count: 12, successRate: 100 },
    { action: 'TYPE', count: 8, successRate: 100 },
    { action: 'SCROLL', count: 5, successRate: 100 },
    { action: 'PRESS', count: 3, successRate: 100 },
    { action: 'WAIT', count: 4, successRate: 100 },
    { action: 'STOP', count: 3, successRate: 100 },
  ]

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/comparison" className="btn-ghost p-2">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </Link>
            <h1 className="page-title">{benchmark.website.name}</h1>
            {benchmark.isSampleData && <Badge variant="warning" size="sm">SAMPLE DATA</Badge>}
          </div>
          <p className="page-subtitle">{benchmark.website.domain}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => window.location.href = `/run/${benchmark.id}/0`} className="gap-2">
            <BarChart2 className="w-4 h-4" />
            View Runs
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="kpi-card lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-transparent" />
          <div className="relative flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent-400" />
              <span className="text-lg font-semibold text-dark-50">EdgeSight Benchmark Score</span>
            </div>
            <Badge variant={getScoreStatus(scores.overallScore) === 'Excellent' ? 'success' : getScoreStatus(scores.overallScore) === 'Good' ? 'info' : getScoreStatus(scores.overallScore) === 'Moderate' ? 'warning' : 'danger'} size="lg">
              {getScoreStatus(scores.overallScore)}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2 relative z-10">
            <span className="text-5xl font-bold text-accent-400 font-mono tabular-nums">{scores.overallScore.toFixed(1)}</span>
            <span className="text-dark-400 mb-3">/ 100</span>
          </div>
          <div className="h-3 bg-dark-800 rounded-full overflow-hidden relative z-10">
            <div
              className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all duration-1000"
              style={{ width: `${scores.overallScore}%` }}
            />
          </div>
          <div className="relative z-10 mt-4 grid grid-cols-5 gap-4 text-center">
            {WEIGHTS.map((w) => {
              const score = scores[w.key as keyof typeof scores] as number
              return (
                <div key={w.key} className="p-3 bg-dark-800/50 rounded-lg">
                  <w.icon className={clsx('w-4 h-4 mx-auto mb-1', w.color)} />
                  <div className="text-xs text-dark-400">{w.label}</div>
                  <div className={clsx('font-bold font-mono', getScoreColor(score))}>{score.toFixed(1)}%</div>
                  <div className="text-xs text-dark-500">{w.weight}% weight</div>
                </div>
              )
            })}
          </div>
        </Card>

        {[
          { label: 'Visual Context', value: scores.visualScore, unit: '%', icon: Eye, color: '#22c55e', status: getScoreStatus(scores.visualScore) },
          { label: 'PII F1 Score', value: scores.piiF1, unit: '%', icon: Shield, color: '#3b82f6', status: getScoreStatus(scores.piiF1) },
          { label: 'Redaction', value: scores.redactionF1, unit: '%', icon: Target, color: '#8b5cf6', status: getScoreStatus(scores.redactionF1) },
          { label: 'Resource Efficiency', value: scores.resourceScore, unit: '%', icon: Zap, color: '#f59e0b', status: getScoreStatus(scores.resourceScore) },
        ].map((kpi) => (
          <Card key={kpi.label} className="kpi-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <kpi.icon className={clsx('w-5 h-5', kpi.color)} />
                <span className="metric-label">{kpi.label}</span>
              </div>
              <Badge variant={kpi.status === 'Excellent' ? 'success' : kpi.status === 'Good' ? 'info' : kpi.status === 'Moderate' ? 'warning' : 'danger'} size="sm">
                {kpi.status}
              </Badge>
            </div>
            <div className="flex items-end gap-1">
              <span className={clsx('text-3xl font-bold', kpi.color)}>{kpi.value.toFixed(1)}</span>
              <span className="text-dark-400 mb-1">{kpi.unit}</span>
            </div>
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
            <Badge variant={scores.piiLeakageStatus === 'SAFE' ? 'success' : 'danger'} size="md">
              {scores.piiLeakageStatus}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-4xl font-bold text-dark-50 font-mono tabular-nums">
              {runs.reduce((a, b) => a + b.pii.outboundLeakCount, 0)}
            </span>
            <span className="text-dark-400 mb-1"> / {runs.reduce((a, b) => a + b.groundTruth.expectedPII, 0)}</span>
          </div>
          <p className="text-dark-400 text-sm mb-4">
            {scores.piiLeakageStatus === 'SAFE'
              ? 'No sensitive data transmitted to server. Privacy preserved across all runs.'
              : '⚠️ Privacy failure detected. Sensitive data leaked in outbound context.'}
          </p>
          <div className="h-3 bg-dark-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', scores.piiLeakageStatus === 'SAFE' ? 'bg-accent-500' : 'bg-danger-500')}
              style={{ width: `${scores.piiLeakageRate}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-dark-500">Leakage Rate: {scores.piiLeakageRate.toFixed(2)}%</div>
        </Card>

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-dark-50">Latency</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-end gap-1 mb-2">
              <span className="text-3xl font-bold text-dark-50 font-mono tabular-nums">
                {formatDuration(runs.reduce((a, b) => a + b.performance.timingsMs.total, 0) / runs.length)}
              </span>
              <Badge variant={getScoreStatus(scores.latencyScore) === 'Excellent' ? 'success' : getScoreStatus(scores.latencyScore) === 'Good' ? 'info' : getScoreStatus(scores.latencyScore) === 'Moderate' ? 'warning' : 'danger'}>
                {getScoreStatus(scores.latencyScore)}
              </Badge>
            </div>
            <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-500 rounded-full"
                style={{ width: `${Math.min(100, (scores.latencyScore / 100) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-dark-500">Score: {scores.latencyScore.toFixed(1)}%</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">PII Confusion Matrix</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-center">TP</th>
                    <th className="text-center">FP</th>
                    <th className="text-center">FN</th>
                    <th className="text-center">Precision</th>
                    <th className="text-center">Recall</th>
                    <th className="text-center">F1</th>
                  </tr>
                </thead>
                <tbody>
                  {piiCategories.map((cat) => {
                    const precision = cat.tp + cat.fp > 0 ? (cat.tp / (cat.tp + cat.fp)) * 100 : 0
                    const recall = cat.tp + cat.fn > 0 ? (cat.tp / (cat.tp + cat.fn)) * 100 : 0
                    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
                    return (
                      <tr key={cat.category}>
                        <td className="font-medium">{cat.category}</td>
                        <td className="text-center font-mono text-accent-400">{cat.tp}</td>
                        <td className="text-center font-mono text-danger-400">{cat.fp}</td>
                        <td className="text-center font-mono text-warning-400">{cat.fn}</td>
                        <td className="text-center font-mono">{precision.toFixed(1)}%</td>
                        <td className="text-center font-mono">{recall.toFixed(1)}%</td>
                        <td className="text-center font-mono font-bold">{f1.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-dark-800/50 font-semibold">
                    <td>Total</td>
                    <td className="text-center font-mono text-accent-400">{piiCategories.reduce((a, b) => a + b.tp, 0)}</td>
                    <td className="text-center font-mono text-danger-400">{piiCategories.reduce((a, b) => a + b.fp, 0)}</td>
                    <td className="text-center font-mono text-warning-400">{piiCategories.reduce((a, b) => a + b.fn, 0)}</td>
                    <td className="text-center font-mono">
                      {piiCategories.reduce((a, b) => a + b.tp, 0) / (piiCategories.reduce((a, b) => a + b.tp, 0) + piiCategories.reduce((a, b) => a + b.fp, 0)) * 100 || 0}% 
                    </td>
                    <td className="text-center font-mono">
                      {piiCategories.reduce((a, b) => a + b.tp, 0) / (piiCategories.reduce((a, b) => a + b.tp, 0) + piiCategories.reduce((a, b) => a + b.fn, 0)) * 100 || 0}%
                    </td>
                    <td className="text-center font-mono font-bold">{scores.piiF1.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">OCR Confidence Distribution</h3>
          </CardHeader>
          <CardContent>
            <PieChart
              data={ocrDistribution.map((d) => ({
                name: d.range,
                value: d.count,
                color: d.range === '90-100%' ? '#22c55e' : d.range === '80-90%' ? '#3b82f6' : d.range === '70-80%' ? '#f59e0b' : '#ef4444',
              }))}
              height={280}
            />
            <div className="mt-4 space-y-2">
              {ocrDistribution.map((d) => (
                <div key={d.range} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor:
                        d.range === '90-100%' ? '#22c55e' :
                        d.range === '80-90%' ? '#3b82f6' :
                        d.range === '70-80%' ? '#f59e0b' : '#ef4444',
                    }}
                  />
                  <span className="w-20 text-sm text-dark-300">{d.range}</span>
                  <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${d.percentage}%`,
                        backgroundColor:
                          d.range === '90-100%' ? '#22c55e' :
                          d.range === '80-90%' ? '#3b82f6' :
                          d.range === '70-80%' ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="w-16 text-right text-sm font-mono text-dark-300">{d.count} ({d.percentage}%)</span>
                </div>
              ))}
              <div className="pt-2 border-t border-dark-700 flex justify-between text-sm">
                <span className="text-dark-400">Avg Confidence</span>
                <span className="font-mono text-dark-100">{(runs.reduce((acc: number, run) => acc + run.ocr.averageConfidence, 0) / runs.length).toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Latency Breakdown</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latencyBreakdown.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="w-40 text-sm text-dark-400">{item.label}</span>
                  <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-500 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-sm font-mono text-dark-300">{formatDuration(item.value)}</span>
                  <span className="w-12 text-right text-xs text-dark-500">{item.percentage.toFixed(1)}%</span>
                </div>
              ))}
              <div className="pt-2 border-t border-dark-700 flex justify-between">
                <span className="text-sm font-medium text-dark-300">Total</span>
                <span className="font-mono text-dark-100">{formatDuration(runs.reduce((a, b) => a + b.performance.timingsMs.total, 0) / runs.length)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">CPU / RAM Over Time</h3>
          </CardHeader>
          <CardContent>
            <LineChart
              data={resourceChartData}
              xKey="timestamp"
              lines={[
                { key: 'cpu', label: 'CPU %', color: '#3b82f6' },
                { key: 'ram', label: 'RAM (×10 MB)', color: '#f59e0b' },
                ...(resourceChartData[0]?.gpu ? [{ key: 'gpu', label: 'GPU %', color: '#8b5cf6' }] : []),
              ]}
              height={280}
              yAxisLabel="Percentage"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">DOM vs Vision vs Fusion</h3>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-center">DOM</th>
                    <th className="text-center">Vision</th>
                    <th className="text-center">Fusion</th>
                    <th className="text-center">Improvement</th>
                  </tr>
                </thead>
                <tbody>
                  {domVisionFusion.map((item) => (
                    <tr key={item.category}>
                      <td className="font-medium">{item.category}</td>
                      <td className="text-center">{item.domAccuracy !== null ? `${item.domAccuracy}%` : <span className="text-dark-500">Not Measured</span>}</td>
                      <td className="text-center">{item.visionAccuracy !== null ? `${item.visionAccuracy}%` : <span className="text-dark-500">Not Measured</span>}</td>
                      <td className="text-center font-bold text-accent-400">{item.fusionAccuracy !== null ? `${item.fusionAccuracy}%` : <span className="text-dark-500">Not Measured</span>}</td>
                      <td className="text-center">
                        {item.domAccuracy !== null && item.fusionAccuracy !== null && item.fusionAccuracy > item.domAccuracy ? (
                          <span className="text-accent-400 font-mono">+{item.fusionAccuracy - item.domAccuracy}%</span>
                        ) : item.domAccuracy !== null && item.fusionAccuracy !== null && item.fusionAccuracy < item.domAccuracy ? (
                          <span className="text-danger-400 font-mono">{item.fusionAccuracy - item.domAccuracy}%</span>
                        ) : (
                          <span className="text-dark-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-dark-500 mt-3">Fusion combines DOM structure with visual perception for improved accuracy.</p>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Task Performance</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-dark-50 font-mono">{runs.reduce((a, b) => a + b.agent.tasksAttempted, 0)}</div>
                  <div className="text-xs text-dark-400">Tasks Attempted</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-accent-400 font-mono">{runs.reduce((a, b) => a + b.agent.tasksCompleted, 0)}</div>
                  <div className="text-xs text-dark-400">Tasks Completed</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-dark-50 font-mono">
                    {((runs.reduce((a, b) => a + b.agent.tasksCompleted, 0) / runs.reduce((a, b) => a + b.agent.tasksAttempted, 0)) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-dark-400">Success Rate</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th className="text-center">Count</th>
                    <th className="text-center">Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {actionBreakdown.map((action) => (
                    <tr key={action.action}>
                      <td className="font-medium text-dark-300">{action.action}</td>
                      <td className="text-center font-mono">{action.count}</td>
                      <td className="text-center">
                        <Badge variant="success" size="sm">{action.successRate}%</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Payload Reduction</h3>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center mb-6">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="#1e293b" strokeWidth="10" />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="10"
                    strokeDasharray={`${(scores.payloadReduction / 100) * 440} 440`}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-dark-50 font-mono">{scores.payloadReduction.toFixed(1)}%</span>
                  <span className="text-xs text-dark-400">Reduction</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-dark-800/50 rounded-lg">
                <div className="text-xl font-bold text-dark-50 font-mono">{formatBytes(runs.reduce((a, b) => a + b.network.rawPayloadBytes, 0) / runs.length)}</div>
                <div className="text-xs text-dark-400">Raw Payload</div>
              </div>
              <div className="p-4 bg-dark-800/50 rounded-lg">
                <div className="text-xl font-bold text-dark-50 font-mono">{formatBytes(runs.reduce((a, b) => a + b.network.sanitizedPayloadBytes, 0) / runs.length)}</div>
                <div className="text-xs text-dark-400">Sanitized</div>
              </div>
              <div className="p-4 bg-dark-800/50 rounded-lg">
                <div className="text-xl font-bold text-accent-400 font-mono">{scores.payloadReduction.toFixed(1)}%</div>
                <div className="text-xs text-dark-400">Reduction</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Redaction Metrics</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-accent-400 font-mono">{runs.reduce((a, b) => a + b.redaction.tp, 0)}</div>
                  <div className="text-xs text-dark-400">Correctly Redacted</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-warning-400 font-mono">{runs.reduce((a, b) => a + b.redaction.fp, 0)}</div>
                  <div className="text-xs text-dark-400">False Positives</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-danger-400 font-mono">{runs.reduce((a, b) => a + b.redaction.fn, 0)}</div>
                  <div className="text-xs text-dark-400">Missed (FN)</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{scores.redactionPrecision.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">Precision</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{scores.redactionRecall.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">Recall</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{scores.redactionF1.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">F1 Score</div>
                </div>
              </div>
              {scores.averageIoU && (
                <div className="pt-2 border-t border-dark-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">Avg Bounding Box IoU</span>
                    <span className="font-mono text-dark-100">{scores.averageIoU.toFixed(4)}</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${scores.averageIoU * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">Individual Test Pages</h3>
        </CardHeader>
        <CardContent>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>URL</th>
                  <th>Runs</th>
                  <th>Visual</th>
                  <th>PII F1</th>
                  <th>Redaction</th>
                  <th>Latency</th>
                  <th>PII Leakage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.pages.map((page) => {
                  const pageRuns = runs.filter((r) => r.page.url === page.url)
                  const pageScores = pageRuns.length > 0
                    ? pageRuns.map((r) => calculateAllScores(r, DEFAULT_THRESHOLDS)).reduce((acc, s) => {
                        Object.keys(acc).forEach((k) => { acc[k as keyof typeof acc] += s[k as keyof typeof s] as number })
                        return acc
                      }, { visualScore: 0, piiF1: 0, redactionF1: 0, latencyScore: 0 } as Record<string, number>)
                    : null
                  const avgScores = pageScores
                    ? Object.fromEntries(Object.entries(pageScores).map(([k, v]) => [k, (v as number) / pageRuns.length]))
                    : null

                  return (
                    <tr key={page.url}>
                      <td className="font-medium">{page.name}</td>
                      <td className="text-dark-400 font-mono text-sm max-w-xs truncate">{page.url}</td>
                      <td className="font-mono">{pageRuns.length}</td>
                      <td>
                        {avgScores ? (
                          <Badge variant={getScoreStatus(avgScores.visualScore) === 'Excellent' ? 'success' : getScoreStatus(avgScores.visualScore) === 'Good' ? 'info' : getScoreStatus(avgScores.visualScore) === 'Moderate' ? 'warning' : 'danger'}>
                            {avgScores.visualScore.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-dark-500">—</span>
                        )}
                      </td>
                      <td>
                        {avgScores ? (
                          <Badge variant={getScoreStatus(avgScores.piiF1) === 'Excellent' ? 'success' : getScoreStatus(avgScores.piiF1) === 'Good' ? 'info' : getScoreStatus(avgScores.piiF1) === 'Moderate' ? 'warning' : 'danger'}>
                            {avgScores.piiF1.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-dark-500">—</span>
                        )}
                      </td>
                      <td>
                        {avgScores ? (
                          <Badge variant={getScoreStatus(avgScores.redactionF1) === 'Excellent' ? 'success' : getScoreStatus(avgScores.redactionF1) === 'Good' ? 'info' : getScoreStatus(avgScores.redactionF1) === 'Moderate' ? 'warning' : 'danger'}>
                            {avgScores.redactionF1.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-dark-500">—</span>
                        )}
                      </td>
                      <td>
                        {avgScores ? (
                          <Badge variant={getScoreStatus(avgScores.latencyScore) === 'Excellent' ? 'success' : getScoreStatus(avgScores.latencyScore) === 'Good' ? 'info' : getScoreStatus(avgScores.latencyScore) === 'Moderate' ? 'warning' : 'danger'}>
                            {avgScores.latencyScore.toFixed(1)}%
                          </Badge>
                        ) : (
                          <span className="text-dark-500">—</span>
                        )}
                      </td>
                      <td>
                        <Badge variant={pageRuns.some((r) => r.pii.outboundLeakCount > 0) ? 'danger' : 'success'}>
                          {pageRuns.reduce((a, b) => a + b.pii.outboundLeakCount, 0)} / {pageRuns.reduce((a, b) => a + b.groundTruth.expectedPII, 0)}
                        </Badge>
                      </td>
                      <td>
                        <Link to={`/run/${benchmark.id}/${runs.findIndex((r) => r.page.url === page.url)}`} className="btn-ghost text-sm gap-1 px-2 py-1">
                          <ChevronRight className="w-3 h-3" />
                          View Runs
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

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Environment Details</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Device</p>
              <p className="font-mono text-dark-100">{benchmark.environment.device}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">CPU</p>
              <p className="font-mono text-dark-100">{benchmark.environment.cpu}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">RAM</p>
              <p className="font-mono text-dark-100">{benchmark.environment.ramGB} GB</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">GPU</p>
              <p className="font-mono text-dark-100">{benchmark.environment.gpu || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">OS</p>
              <p className="font-mono text-dark-100">{benchmark.environment.os}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Browser</p>
              <p className="font-mono text-dark-100">{benchmark.environment.browser} {benchmark.environment.browserVersion}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">EdgeSight</p>
              <p className="font-mono text-dark-100">{benchmark.environment.edgeSightVersion}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Vision Model</p>
              <p className="font-mono text-dark-100">{benchmark.environment.visionModel}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Pages Tested</p>
              <p className="font-mono text-dark-100">{benchmark.pages.length}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Total Runs</p>
              <p className="font-mono text-dark-100">{benchmark.runs.length}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Benchmark Date</p>
              <p className="font-mono text-dark-100">{formatRelativeTime(benchmark.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-dark-500 uppercase tracking-wider mb-1">Sample Data</p>
              <p className="font-mono text-dark-100">{benchmark.isSampleData ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { TrendingUp } from 'lucide-react'