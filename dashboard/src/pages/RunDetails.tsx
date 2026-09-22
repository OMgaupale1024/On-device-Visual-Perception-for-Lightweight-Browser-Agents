import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Eye, Shield, Target, Zap, Clock, AlertTriangle, Database, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@components/ui/Card'
import { Badge } from '@components/ui/Badge'
import { useBenchmark } from '@services/BenchmarkContext'
import { calculateAllScores, DEFAULT_THRESHOLDS } from '@scoring/index'
import { formatBytes, formatDuration, getScoreStatus, formatRelativeTime, cn as clsx } from '@utils/format'

export function RunDetails() {
  const { websiteId, runIndex } = useParams<{ websiteId: string; runIndex: string }>()
  const { state } = useBenchmark()

  const benchmark = useMemo(() => state.benchmarks.find((b) => b.id === websiteId), [state.benchmarks, websiteId])
  const run = useMemo(() => benchmark?.runs[parseInt(runIndex || '0', 10)], [benchmark, runIndex])

  if (!benchmark || !run) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Database className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-dark-100 mb-2">Run Not Found</h2>
          <p className="text-dark-400">The requested run does not exist.</p>
        </div>
      </div>
    )
  }

  const scores = calculateAllScores(run, DEFAULT_THRESHOLDS)
  const overallStatus = getScoreStatus(scores.overallScore)

  const latencyStages = [
    { label: 'Screen Capture', key: 'screenCapture', icon: Eye, color: '#22c55e' },
    { label: 'DOM Processing', key: 'dom', icon: Target, color: '#3b82f6' },
    { label: 'Vision/OCR', key: 'vision', icon: Eye, color: '#8b5cf6' },
    { label: 'PII Detection', key: 'pii', icon: Shield, color: '#f59e0b' },
    { label: 'Redaction', key: 'redaction', icon: Target, color: '#ef4444' },
    { label: 'Privacy Guard', key: 'privacyGuard', icon: AlertTriangle, color: '#06b6d4' },
    { label: 'Server Reasoning', key: 'server', icon: Database, color: '#ec4899' },
    { label: 'Action Execution', key: 'action', icon: Zap, color: '#14b8a6' },
  ]

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to={`/website/${websiteId}`} className="btn-ghost p-2">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title">Run #{run.run.runNumber}</h1>
              {run.isSampleData && <Badge variant="warning" size="sm">SAMPLE DATA</Badge>}
            </div>
            <p className="page-subtitle">{benchmark.website.name} — {run.page.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <span className="font-mono">{formatRelativeTime(run.run.timestamp)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={clsx('kpi-card relative overflow-hidden', overallStatus === 'Excellent' && 'border-accent-500/30')}>
          <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-transparent" />
          <div className="relative flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent-400" />
              <span className="text-lg font-semibold text-dark-50">Overall Score</span>
            </div>
            <Badge variant={overallStatus === 'Excellent' ? 'success' : overallStatus === 'Good' ? 'info' : overallStatus === 'Moderate' ? 'warning' : 'danger'} size="lg">
              {overallStatus}
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
        </Card>

        {[
          { key: 'visualScore', label: 'Visual Context', value: scores.visualScore, unit: '%', icon: Eye, color: '#22c55e', status: getScoreStatus(scores.visualScore) },
          { key: 'piiF1', label: 'PII F1', value: scores.piiF1, unit: '%', icon: Shield, color: '#3b82f6', status: getScoreStatus(scores.piiF1) },
          { key: 'redactionF1', label: 'Redaction', value: scores.redactionF1, unit: '%', icon: Target, color: '#8b5cf6', status: getScoreStatus(scores.redactionF1) },
        ].map((kpi) => (
          <Card key={kpi.key} className="kpi-card">
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

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <span className="metric-label">Latency</span>
            </div>
            <Badge variant={getScoreStatus(scores.latencyScore) === 'Excellent' ? 'success' : getScoreStatus(scores.latencyScore) === 'Good' ? 'info' : getScoreStatus(scores.latencyScore) === 'Moderate' ? 'warning' : 'danger'} size="sm">
              {getScoreStatus(scores.latencyScore)}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-bold text-blue-400 font-mono">{formatDuration(run.performance.timingsMs.total)}</span>
          </div>
          <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${scores.latencyScore}%` }} />
          </div>
        </Card>

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-warning-400" />
              <span className="metric-label">Resources</span>
            </div>
            <Badge variant={getScoreStatus(scores.resourceScore) === 'Excellent' ? 'success' : getScoreStatus(scores.resourceScore) === 'Good' ? 'info' : getScoreStatus(scores.resourceScore) === 'Moderate' ? 'warning' : 'danger'} size="sm">
              {getScoreStatus(scores.resourceScore)}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-bold text-warning-400 font-mono">{scores.resourceScore.toFixed(1)}</span>
            <span className="text-dark-400 mb-1">%</span>
          </div>
          <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
            <div className="h-full bg-warning-500 rounded-full" style={{ width: `${scores.resourceScore}%` }} />
          </div>
        </Card>

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className={clsx('w-5 h-5', run.pii.outboundLeakCount > 0 ? 'text-danger-400' : 'text-accent-400')} />
              <span className="metric-label">PII Leakage</span>
            </div>
            <Badge variant={run.pii.outboundLeakCount > 0 ? 'danger' : 'success'} size="sm">
              {run.pii.outboundLeakCount > 0 ? 'PRIVACY FAILURE' : 'SAFE'}
            </Badge>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className={clsx('text-3xl font-bold font-mono', run.pii.outboundLeakCount > 0 ? 'text-danger-400' : 'text-accent-400')}>{run.pii.outboundLeakCount}</span>
            <span className="text-dark-400 mb-1"> / {run.groundTruth.expectedPII}</span>
          </div>
          <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full', run.pii.outboundLeakCount > 0 ? 'bg-danger-500' : 'bg-accent-500')}
              style={{ width: run.groundTruth.expectedPII > 0 ? `${(run.pii.outboundLeakCount / run.groundTruth.expectedPII) * 100}%` : '0%' }}
            />
          </div>
        </Card>

        <Card className="kpi-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-violet-400" />
              <span className="metric-label">IoU</span>
            </div>
          </div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-bold text-violet-400 font-mono">{run.redaction.averageIoU?.toFixed(4) || 'N/A'}</span>
          </div>
          <div className="text-sm text-dark-400">Bounding Box IoU</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Ground Truth vs Results</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-dark-50 font-mono">{run.groundTruth.expectedElements}</div>
                  <div className="text-xs text-dark-400">Expected Elements</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-accent-400 font-mono">{run.visual.correctElements}</div>
                  <div className="text-xs text-dark-400">Detected Correctly</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-danger-400 font-mono">{run.groundTruth.expectedElements - run.visual.correctElements}</div>
                  <div className="text-xs text-dark-400">Missed</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-dark-50 font-mono">{run.groundTruth.expectedPII}</div>
                  <div className="text-xs text-dark-400">Expected PII</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-accent-400 font-mono">{run.pii.tp}</div>
                  <div className="text-xs text-dark-400">True Positives</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-danger-400 font-mono">{run.pii.fp}</div>
                  <div className="text-xs text-dark-400">False Positives</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-dark-50 font-mono">{run.groundTruth.expectedRedactions}</div>
                  <div className="text-xs text-dark-400">Expected Redactions</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-accent-400 font-mono">{run.redaction.tp}</div>
                  <div className="text-xs text-dark-400">Correctly Redacted</div>
                </div>
                <div className="p-4 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-warning-400 font-mono">{run.redaction.fp}</div>
                  <div className="text-xs text-dark-400">False Positives</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">PII Detection Details</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-dark-400">Precision</span>
                <span className="font-mono text-accent-400">{scores.piiPrecision.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div className="h-full bg-accent-500 rounded-full" style={{ width: `${scores.piiPrecision}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Recall</span>
                <span className="font-mono text-blue-400">{scores.piiRecall.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${scores.piiRecall}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">F1 Score</span>
                <span className="font-mono text-violet-400">{scores.piiF1.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${scores.piiF1}%` }} />
              </div>
              <div className="pt-2 border-t border-dark-700 grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-dark-800/50 rounded-lg">
                  <div className="text-xl font-bold text-accent-400 font-mono">{run.pii.tp}</div>
                  <div className="text-xs text-dark-400">True Positives</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg">
                  <div className="text-xl font-bold text-danger-400 font-mono">{run.pii.fp}</div>
                  <div className="text-xs text-dark-400">False Positives</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg">
                  <div className="text-xl font-bold text-warning-400 font-mono">{run.pii.fn}</div>
                  <div className="text-xs text-dark-400">False Negatives</div>
                </div>
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
              {latencyStages.map((stage) => {
                const value = run.performance.timingsMs[stage.key as keyof typeof run.performance.timingsMs]
                const percentage = ((value / run.performance.timingsMs.total) * 100).toFixed(1)
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <stage.icon className={clsx('w-4 h-4', stage.color)} />
                    <span className="w-40 text-sm text-dark-400">{stage.label}</span>
                    <div className="flex-1 h-2 bg-dark-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: stage.color }} />
                    </div>
                    <span className="w-24 text-right text-sm font-mono text-dark-300">{formatDuration(value)}</span>
                    <span className="w-12 text-right text-xs text-dark-500">{percentage}%</span>
                  </div>
                )
              })}
              <div className="pt-2 border-t border-dark-700 flex justify-between">
                <span className="text-sm font-medium text-dark-300">Total</span>
                <span className="font-mono text-dark-100">{formatDuration(run.performance.timingsMs.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Resource Usage</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-dark-400">CPU Usage</span>
                  <span className="font-mono text-dark-300">{run.performance.cpu.average.toFixed(1)}% avg / {run.performance.cpu.peak.toFixed(1)}% peak</span>
                </div>
                <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, run.performance.cpu.average)}%` }} />
                </div>
                <div className="text-xs text-dark-500 mt-1">CPU Score: {scores.cpuScore.toFixed(1)}%</div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-dark-400">RAM Usage</span>
                  <span className="font-mono text-dark-300">{formatBytes(run.performance.ramMB.average * 1024 * 1024)} avg / {formatBytes(run.performance.ramMB.peak * 1024 * 1024)} peak</span>
                </div>
                <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                  <div className="h-full bg-warning-500 rounded-full" style={{ width: `${Math.min(100, (run.performance.ramMB.average / 800) * 100)}%` }} />
                </div>
                <div className="text-xs text-dark-500 mt-1">RAM Score: {scores.ramScore.toFixed(1)}%</div>
              </div>
              {run.performance.gpuAverage && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-dark-400">GPU Usage</span>
                    <span className="font-mono text-dark-300">{run.performance.gpuAverage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, run.performance.gpuAverage)}%` }} />
                  </div>
                  <div className="text-xs text-dark-500 mt-1">Diagnostic only</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">OCR Analytics</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-4">
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{run.ocr.detections}</div>
                  <div className="text-xs text-dark-400">Total Detections</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-accent-400 font-mono">{run.ocr.accepted}</div>
                  <div className="text-xs text-dark-400">Accepted</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-warning-400 font-mono">{run.ocr.rejected}</div>
                  <div className="text-xs text-dark-400">Rejected</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{run.ocr.averageConfidence.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">Avg Confidence</div>
                </div>
              </div>
              <div className="pt-2 border-t border-dark-700">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-dark-400">Vision Inference Latency</span>
                  <span className="font-mono text-dark-300">{formatDuration(run.performance.timingsMs.vision)}</span>
                </div>
                <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, (run.performance.timingsMs.vision / run.performance.timingsMs.total) * 100)}%` }} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="chart-container">
          <CardHeader>
            <h3 className="text-lg font-semibold text-dark-50">Payload & Privacy Guard</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{formatBytes(run.network.rawPayloadBytes)}</div>
                  <div className="text-xs text-dark-400">Raw Payload</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-accent-400 font-mono">{formatBytes(run.network.sanitizedPayloadBytes)}</div>
                  <div className="text-xs text-dark-400">Sanitized</div>
                </div>
                <div className="p-3 bg-dark-800/50 rounded-lg text-center">
                  <div className="text-xl font-bold text-dark-50 font-mono">{scores.payloadReduction.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">Reduction</div>
                </div>
              </div>
              <div className="pt-2 border-t border-dark-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-dark-400">Privacy Guard Status</span>
                  <Badge variant={run.pii.outboundLeakCount > 0 ? 'danger' : 'success'} size="md">
                    {run.pii.outboundLeakCount > 0 ? 'LEAK DETECTED' : 'SECURE'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-dark-400">Sensitive Values Detected</span>
                  <span className="font-mono text-dark-100">{run.groundTruth.expectedPII}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-dark-400">Sensitive Values Redacted</span>
                  <span className="font-mono text-accent-400">{run.redaction.tp}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-dark-400">Sensitive Values Outbound</span>
                  <span className={clsx('font-mono', run.pii.outboundLeakCount > 0 ? 'text-danger-400' : 'text-accent-400')}>{run.pii.outboundLeakCount}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Agent Actions</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-dark-800/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-dark-50 font-mono">{run.agent.tasksAttempted}</div>
              <div className="text-xs text-dark-400">Tasks Attempted</div>
            </div>
            <div className="p-3 bg-dark-800/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-accent-400 font-mono">{run.agent.tasksCompleted}</div>
              <div className="text-xs text-dark-400">Tasks Completed</div>
            </div>
            <div className="p-3 bg-dark-800/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-accent-400 font-mono">{run.agent.correctActions}</div>
              <div className="text-xs text-dark-400">Correct Actions</div>
            </div>
            <div className="p-3 bg-dark-800/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-danger-400 font-mono">{run.agent.incorrectActions}</div>
              <div className="text-xs text-dark-400">Incorrect Actions</div>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-dark-400">Action Accuracy</span>
            <span className="font-mono text-dark-100">
              {((run.agent.correctActions / (run.agent.correctActions + run.agent.incorrectActions)) * 100).toFixed(1)}%
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">Run Result</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge
              variant={
                overallStatus === 'Excellent' && run.pii.outboundLeakCount === 0 ? 'success' :
                overallStatus === 'Good' && run.pii.outboundLeakCount === 0 ? 'info' :
                run.pii.outboundLeakCount > 0 ? 'danger' : 'warning'
              }
              size="lg"
              className="px-4 py-2 text-base"
            >
              {run.pii.outboundLeakCount > 0 ? 'FAIL' : overallStatus === 'Excellent' ? 'PASS' : overallStatus === 'Good' ? 'PASS' : 'WARNING'}
            </Badge>
            <div className="text-dark-400">
              {run.pii.outboundLeakCount > 0
                ? 'Privacy failure: sensitive data leaked in outbound context.'
                : overallStatus === 'Excellent'
                ? 'Excellent performance with no privacy violations.'
                : overallStatus === 'Good'
                ? 'Good performance with no privacy violations.'
                : 'Performance needs improvement. Review component scores.'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { TrendingUp } from 'lucide-react'