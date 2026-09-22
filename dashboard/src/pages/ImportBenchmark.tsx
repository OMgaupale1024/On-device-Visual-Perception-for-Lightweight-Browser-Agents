import { useState, useRef } from 'react'
import { Upload, FileJson, CheckCircle, AlertCircle, X, Code, Download, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@components/ui/Card'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { useBenchmark } from '@services/BenchmarkContext'
import { useToast } from '@components/ui/Toaster'
import { clsx } from 'clsx'
import type { BenchmarkRun } from '@types'

export function ImportBenchmark() {
  const { importRuns } = useBenchmark()
  const { showToast } = useToast()
  const [dragActive, setDragActive] = useState(false)
  const [parsedData, setParsedData] = useState<BenchmarkRun[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json')) {
      setParseError('Please select a JSON file')
      showToast({ type: 'error', title: 'Invalid file type', message: 'Please select a JSON file' })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)

        let runs: BenchmarkRun[] = []

        if (Array.isArray(data)) {
          runs = data
        } else if (data.runs && Array.isArray(data.runs)) {
          runs = data.runs
        } else if (data.website && data.environment) {
          runs = [data]
        }

        if (runs.length === 0) {
          throw new Error('No valid benchmark runs found in the file')
        }

        setParsedData(runs)
        setParseError(null)
        showToast({ type: 'success', title: 'File parsed successfully', message: `Found ${runs.length} benchmark run(s)` })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse JSON'
        setParseError(message)
        showToast({ type: 'error', title: 'Parse Error', message })
      }
    }
    reader.readAsText(file)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleImport = async () => {
    if (!parsedData || isImporting) return

    setIsImporting(true)
    try {
      await importRuns(parsedData)
      showToast({ type: 'success', title: 'Import Successful', message: `${parsedData.length} run(s) imported successfully` })
      setParsedData(null)
    } catch (error) {
      showToast({ type: 'error', title: 'Import Failed', message: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsImporting(false)
    }
  }

  const handleClear = () => {
    setParsedData(null)
    setParseError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = () => {
    const template = {
      website: { name: 'Example Website', domain: 'example.com' },
      environment: {
        device: 'Device Name',
        cpu: 'CPU Model',
        ramGB: 16,
        gpu: 'GPU Model',
        os: 'Operating System',
        browser: 'Chrome',
        browserVersion: '120.0.0.0',
        edgeSightVersion: '0.1.0',
        visionModel: 'model-name',
      },
      page: { name: 'Page Name', url: 'https://example.com/page' },
      run: { runNumber: 1, timestamp: new Date().toISOString() },
      groundTruth: { expectedElements: 25, expectedPII: 5, expectedRedactions: 5 },
      visual: { correctElements: 23, domAccuracy: 95, visionAccuracy: 90, fusionAccuracy: 98 },
      pii: { tp: 5, fp: 0, fn: 0, outboundLeakCount: 0 },
      redaction: { tp: 5, fp: 0, fn: 0, averageIoU: 0.93 },
      ocr: { detections: 30, accepted: 28, rejected: 2, averageConfidence: 95.2 },
      performance: {
        coldRun: false,
        timingsMs: { screenCapture: 40, dom: 20, vision: 800, pii: 25, redaction: 10, privacyGuard: 5, server: 350, action: 10, total: 1260 },
        cpu: { average: 28, peak: 52 },
        ramMB: { average: 380, peak: 450 },
        gpuAverage: 15,
      },
      agent: { tasksAttempted: 1, tasksCompleted: 1, correctActions: 4, incorrectActions: 0 },
      network: { rawPayloadBytes: 1900000, sanitizedPayloadBytes: 220000 },
    }

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'edgesight-benchmark-template.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Import Benchmark</h1>
        <p className="page-subtitle">Upload EdgeSight benchmark JSON files to analyze privacy and performance metrics</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-50">Upload JSON File</h3>
          <Button variant="ghost" size="sm" onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Download Template
          </Button>
        </CardHeader>
        <CardContent>
          <div
            className={clsx(
              'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
              dragActive ? 'border-accent-500 bg-accent-500/5' : 'border-dark-700 hover:border-dark-600',
              parseError && 'border-danger-500 bg-danger-500/5'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Select JSON file"
            />
            <FileJson className={clsx('w-16 h-16 mx-auto mb-4', dragActive ? 'text-accent-500' : 'text-dark-500')} />
            <p className="text-lg font-medium text-dark-300 mb-1">
              {dragActive ? 'Drop JSON file here' : 'Drag & drop JSON file here, or click to browse'}
            </p>
            <p className="text-dark-500 mb-4">Supports .json files with benchmark run data</p>
            <Button variant="secondary" className="gap-2">
              <Upload className="w-4 h-4" />
              Browse Files
            </Button>
          </div>

          {parseError && (
            <div className="mt-4 p-4 bg-danger-500/10 border border-danger-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-danger-400">Parse Error</p>
                <p className="text-sm text-dark-400 mt-1">{parseError}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {parsedData && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold text-dark-50">Preview ({parsedData.length} runs)</h3>
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1">
              <X className="w-4 h-4" />
              Clear
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {parsedData.slice(0, 10).map((run, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg border border-dark-700">
                  <div className="flex items-center gap-3">
                    <span className="text-dark-500 text-sm">{index + 1}.</span>
                    <div>
                      <p className="font-medium text-dark-100">{run.website.name}</p>
                      <p className="text-sm text-dark-400">{run.page.name} — Run #{run.run.runNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" size="sm">
                      {run.groundTruth.expectedElements} elements
                    </Badge>
                    <Badge variant="neutral" size="sm">
                      {run.groundTruth.expectedPII} PII
                    </Badge>
                    <Badge variant={run.pii.outboundLeakCount > 0 ? 'danger' : 'success'} size="sm">
                      {run.pii.outboundLeakCount > 0 ? 'LEAK' : 'SAFE'}
                    </Badge>
                    <Button variant="ghost" size="sm" className="p-1">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {parsedData.length > 10 && (
                <div className="text-center text-dark-500 py-2">
                  +{parsedData.length - 10} more runs
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleImport} disabled={isImporting} className="gap-2">
                {isImporting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Import {parsedData.length} Run(s)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Expected JSON Format</h3>
        </CardHeader>
        <CardContent>
          <p className="text-dark-400 mb-4">
            The dashboard accepts JSON files containing either a single benchmark run object or an array of run objects.
            Each run should follow the EdgeSight benchmark schema:
          </p>
          <div className="bg-dark-950 border border-dark-700 rounded-lg p-4 font-mono text-xs text-dark-300 overflow-x-auto max-h-96">
            <pre>{`{
  "website": { "name": "string", "domain": "string" },
  "environment": {
    "device": "string",
    "cpu": "string",
    "ramGB": number,
    "gpu": "string?",
    "os": "string",
    "browser": "string",
    "browserVersion": "string",
    "edgeSightVersion": "string",
    "visionModel": "string"
  },
  "page": { "name": "string", "url": "string" },
  "run": { "runNumber": number, "timestamp": "ISO_STRING" },
  "groundTruth": { "expectedElements": number, "expectedPII": number, "expectedRedactions": number },
  "visual": { "correctElements": number, "domAccuracy": number?, "visionAccuracy": number?, "fusionAccuracy": number? },
  "pii": { "tp": number, "fp": number, "fn": number, "outboundLeakCount": number },
  "redaction": { "tp": number, "fp": number, "fn": number, "averageIoU": number? },
  "ocr": { "detections": number, "accepted": number, "rejected": number, "averageConfidence": number },
  "performance": {
    "coldRun": boolean,
    "timingsMs": { "screenCapture": number, "dom": number, "vision": number, "pii": number, "redaction": number, "privacyGuard": number, "server": number, "action": number, "total": number },
    "cpu": { "average": number, "peak": number },
    "ramMB": { "average": number, "peak": number },
    "gpuAverage": number?
  },
  "agent": { "tasksAttempted": number, "tasksCompleted": number, "correctActions": number, "incorrectActions": number },
  "network": { "rawPayloadBytes": number, "sanitizedPayloadBytes": number }
}`}</pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-dark-50">Notes</h3>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-dark-400 text-sm">
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> All numeric fields should be numbers, not strings</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> Timestamps must be valid ISO 8601 strings</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> Missing optional fields will be treated as "Not Measured"</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> The dashboard calculates all scores automatically on import</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> Multiple runs for the same website are grouped automatically</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> Data is stored locally in IndexedDB (no server required)</li>
            <li className="flex items-start gap-2"><Code className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent-400" /> Sample data must be marked with <span className="font-medium text-warning-400">"isSampleData": true</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}