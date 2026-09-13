import { useState, useEffect } from 'react'
import { Save, AlertTriangle, Info, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@components/ui/Card'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Input, Label } from '@components/ui/Input'
import { useBenchmark } from '@services/BenchmarkContext'
import { useToast } from '@components/ui/Toaster'
import { DEFAULT_THRESHOLDS } from '@scoring/index'
import type { BenchmarkThresholds } from '@types'

export function BenchmarkSettings() {
  const { state, saveSettings } = useBenchmark()
  const { showToast } = useToast()
  const [thresholds, setThresholds] = useState<BenchmarkThresholds>(state.settings.thresholds)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setThresholds(state.settings.thresholds)
    setHasChanges(false)
  }, [state.settings.thresholds])

  const handleChange = (path: string, value: number) => {
    const keys = path.split('.')
    setThresholds((prev: BenchmarkThresholds) => {
      const newThresholds = JSON.parse(JSON.stringify(prev))
      let obj: Record<string, any> = newThresholds
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return newThresholds
    })
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveSettings({ ...state.settings, thresholds, updatedAt: new Date().toISOString() })
      showToast({ type: 'success', title: 'Settings Saved', message: 'Benchmark thresholds have been updated' })
      setHasChanges(false)
    } catch (error) {
      showToast({ type: 'error', title: 'Save Failed', message: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS)
    setHasChanges(true)
    showToast({ type: 'info', title: 'Reset to Defaults', message: 'Thresholds reset to EdgeSight benchmark defaults' })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Benchmark Settings</h1>
          <p className="page-subtitle">Configure EdgeSight benchmark thresholds for scoring</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleReset} disabled={isSaving} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving} className="gap-2">
            {isSaving ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="p-4 bg-warning-500/10 border border-warning-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-warning-400">Important</p>
            <p className="text-sm text-dark-400 mt-1">
              Changing benchmark thresholds can make scores less comparable with previous benchmark results.
              Each saved benchmark preserves the configuration used to generate the score.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">Latency Thresholds</h3>
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <Info className="w-3 h-3" />
            <span>EdgeSight Benchmark Thresholds (ms)</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="latency-excellent">Excellent (Score 100)</Label>
                <Input
                  id="latency-excellent"
                  type="number"
                  value={thresholds.latency.excellent}
                  onChange={(e) => handleChange('latency.excellent', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                />
                <p className="text-xs text-dark-500 mt-1">≤ {thresholds.latency.excellent} ms</p>
              </div>
              <div>
                <Label htmlFor="latency-good">Good (Score 90)</Label>
                <Input
                  id="latency-good"
                  type="number"
                  value={thresholds.latency.good}
                  onChange={(e) => handleChange('latency.good', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                />
                <p className="text-xs text-dark-500 mt-1">{thresholds.latency.excellent + 1}–{thresholds.latency.good} ms</p>
              </div>
              <div>
                <Label htmlFor="latency-moderate">Moderate (Score 80)</Label>
                <Input
                  id="latency-moderate"
                  type="number"
                  value={thresholds.latency.moderate}
                  onChange={(e) => handleChange('latency.moderate', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                />
                <p className="text-xs text-dark-500 mt-1">{thresholds.latency.good + 1}–{thresholds.latency.moderate} ms</p>
              </div>
              <div>
                <Label htmlFor="latency-fair">Fair (Score 70)</Label>
                <Input
                  id="latency-fair"
                  type="number"
                  value={thresholds.latency.fair}
                  onChange={(e) => handleChange('latency.fair', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                />
                <p className="text-xs text-dark-500 mt-1">{thresholds.latency.moderate + 1}–{thresholds.latency.fair} ms</p>
              </div>
              <div>
                <Label htmlFor="latency-poor">Poor (Score 50)</Label>
                <Input
                  id="latency-poor"
                  type="number"
                  value={thresholds.latency.poor}
                  onChange={(e) => handleChange('latency.poor', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                />
                <p className="text-xs text-dark-500 mt-1">{thresholds.latency.fair + 1}–{thresholds.latency.poor} ms</p>
              </div>
              <div>
                <Label htmlFor="latency-fail">Fail (Score 30)</Label>
                <Input
                  id="latency-fail"
                  type="number"
                  value={thresholds.latency.fail}
                  onChange={(e) => handleChange('latency.fail', parseInt(e.target.value, 10))}
                  min={0}
                  step={100}
                  className="font-mono"
                  readOnly
                />
                <p className="text-xs text-dark-500 mt-1">{'>'} {thresholds.latency.poor} ms</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">CPU Usage Thresholds</h3>
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <Info className="w-3 h-3" />
            <span>Average CPU % (lower is better)</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cpu-excellent">Excellent (Score 100)</Label>
              <Input
                id="cpu-excellent"
                type="number"
                value={thresholds.cpu.excellent}
                onChange={(e) => handleChange('cpu.excellent', parseInt(e.target.value, 10))}
                min={0}
                max={100}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">≤ {thresholds.cpu.excellent}%</p>
            </div>
            <div>
              <Label htmlFor="cpu-good">Good (Score 90)</Label>
              <Input
                id="cpu-good"
                type="number"
                value={thresholds.cpu.good}
                onChange={(e) => handleChange('cpu.good', parseInt(e.target.value, 10))}
                min={0}
                max={100}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.cpu.excellent + 1}–{thresholds.cpu.good}%</p>
            </div>
            <div>
              <Label htmlFor="cpu-moderate">Moderate (Score 80)</Label>
              <Input
                id="cpu-moderate"
                type="number"
                value={thresholds.cpu.moderate}
                onChange={(e) => handleChange('cpu.moderate', parseInt(e.target.value, 10))}
                min={0}
                max={100}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.cpu.good + 1}–{thresholds.cpu.moderate}%</p>
            </div>
            <div>
              <Label htmlFor="cpu-fair">Fair (Score 65)</Label>
              <Input
                id="cpu-fair"
                type="number"
                value={thresholds.cpu.fair}
                onChange={(e) => handleChange('cpu.fair', parseInt(e.target.value, 10))}
                min={0}
                max={100}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.cpu.moderate + 1}–{thresholds.cpu.fair}%</p>
            </div>
            <div className="md:col-span-2">
              <Label>Fail (Score 45)</Label>
              <p className="text-xs text-dark-500 mt-1">{'>'} {thresholds.cpu.fair}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">RAM Usage Thresholds</h3>
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <Info className="w-3 h-3" />
            <span>Average RAM MB (lower is better)</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ram-excellent">Excellent (Score 100)</Label>
              <Input
                id="ram-excellent"
                type="number"
                value={thresholds.ram.excellent}
                onChange={(e) => handleChange('ram.excellent', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">≤ {thresholds.ram.excellent} MB</p>
            </div>
            <div>
              <Label htmlFor="ram-good">Good (Score 90)</Label>
              <Input
                id="ram-good"
                type="number"
                value={thresholds.ram.good}
                onChange={(e) => handleChange('ram.good', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.ram.excellent + 1}–{thresholds.ram.good} MB</p>
            </div>
            <div>
              <Label htmlFor="ram-moderate">Moderate (Score 80)</Label>
              <Input
                id="ram-moderate"
                type="number"
                value={thresholds.ram.moderate}
                onChange={(e) => handleChange('ram.moderate', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.ram.good + 1}–{thresholds.ram.moderate} MB</p>
            </div>
            <div>
              <Label htmlFor="ram-fair">Fair (Score 65)</Label>
              <Input
                id="ram-fair"
                type="number"
                value={thresholds.ram.fair}
                onChange={(e) => handleChange('ram.fair', parseInt(e.target.value, 10))}
                min={0}
                step={50}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">{thresholds.ram.moderate + 1}–{thresholds.ram.fair} MB</p>
            </div>
            <div className="md:col-span-2">
              <Label>Fail (Score 45)</Label>
              <p className="text-xs text-dark-500 mt-1">{'>'} {thresholds.ram.fair} MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">Other Settings</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ocr-threshold">OCR Confidence Threshold</Label>
              <Input
                id="ocr-threshold"
                type="number"
                value={thresholds.ocrConfidenceThreshold}
                onChange={(e) => handleChange('ocrConfidenceThreshold', parseInt(e.target.value, 10))}
                min={0}
                max={100}
                step={5}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">Detections below this are rejected</p>
            </div>
            <div>
              <Label htmlFor="runs-per-page">Runs Per Page</Label>
              <Input
                id="runs-per-page"
                type="number"
                value={thresholds.runsPerPage}
                onChange={(e) => handleChange('runsPerPage', parseInt(e.target.value, 10))}
                min={1}
                max={20}
                step={1}
                className="font-mono"
              />
              <p className="text-xs text-dark-500 mt-1">Number of runs per page for benchmarking</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Score Weights (Fixed)</h3>
        </CardHeader>
        <CardContent>
          <p className="text-dark-400 mb-4 text-sm">
            The following weights are defined by the SIH evaluation criteria and cannot be changed:
          </p>
          <div className="space-y-3">
            {[
              { name: 'Visual Context Accuracy', weight: '25%', color: '#22c55e' },
              { name: 'PII Detection', weight: '20%', color: '#3b82f6' },
              { name: 'Redaction', weight: '20%', color: '#8b5cf6' },
              { name: 'Client Resource Utilization', weight: '20%', color: '#f59e0b' },
              { name: 'End-to-End Latency', weight: '15%', color: '#06b6d4' },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
                  <span className="text-dark-300">{item.name}</span>
                </div>
                <Badge variant="neutral" size="md">{item.weight}</Badge>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg border border-dark-600">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded bg-dark-600" />
                <span className="font-semibold text-dark-100">Total</span>
              </div>
              <Badge variant="info" size="md">100%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Status Thresholds</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { status: 'Excellent', range: '90–100', color: '#22c55e', description: 'Production ready' },
              { status: 'Good', range: '80–89', color: '#3b82f6', description: 'Acceptable for most use cases' },
              { status: 'Moderate', range: '70–79', color: '#f59e0b', description: 'Needs optimization' },
              { status: 'Needs Improvement', range: 'Below 70', color: '#ef4444', description: 'Significant issues detected' },
            ].map((item) => (
              <div key={item.status} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant={item.status === 'Excellent' ? 'success' : item.status === 'Good' ? 'info' : item.status === 'Moderate' ? 'warning' : 'danger'} size="md">
                    {item.status}
                  </Badge>
                  <span className="font-mono text-dark-400">{item.range}</span>
                </div>
                <span className="text-sm text-dark-500">{item.description}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Privacy Status (Non-configurable)</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant="success" size="md">SAFE</Badge>
                <span className="font-mono text-dark-400">0 PII leaked</span>
              </div>
              <span className="text-sm text-dark-500">No sensitive data transmitted</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Badge variant="danger" size="md">PRIVACY FAILURE</Badge>
                <span className="font-mono text-dark-400">{'>'} 0 PII leaked</span>
              </div>
              <span className="text-sm text-danger-400">Sensitive data in outbound context — Always visible regardless of overall score</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}