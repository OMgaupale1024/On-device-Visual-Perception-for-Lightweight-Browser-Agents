import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type {
  AggregatedWebsiteBenchmark,
  BenchmarkRun,
  BenchmarkSettings,
  BenchmarkThresholds,
} from '../types'
import { aggregateScores, calculateAllScores, DEFAULT_THRESHOLDS as scoringDefaultThresholds } from '../scoring'

interface BenchmarkDB extends DBSchema {
  benchmarks: {
    key: string
    value: AggregatedWebsiteBenchmark
    indexes: { 'by-domain': string; 'by-date': string }
  }
  settings: {
    key: string
    value: BenchmarkSettings
  }
}

const DB_NAME = 'edgesight-analytics'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<BenchmarkDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BenchmarkDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const benchmarkStore = db.createObjectStore('benchmarks', { keyPath: 'id' })
        benchmarkStore.createIndex('by-domain', 'website.domain')
        benchmarkStore.createIndex('by-date', 'createdAt')

        db.createObjectStore('settings', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

export interface BenchmarkState {
  benchmarks: AggregatedWebsiteBenchmark[]
  settings: BenchmarkSettings
  isLoading: boolean
  error: string | null
}

type BenchmarkAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_BENCHMARKS'; payload: AggregatedWebsiteBenchmark[] }
  | { type: 'ADD_BENCHMARK'; payload: AggregatedWebsiteBenchmark }
  | { type: 'UPDATE_BENCHMARK'; payload: AggregatedWebsiteBenchmark }
  | { type: 'REMOVE_BENCHMARK'; payload: string }
  | { type: 'SET_SETTINGS'; payload: BenchmarkSettings }
  | { type: 'IMPORT_BENCHMARKS'; payload: BenchmarkRun[] }

function benchmarkReducer(state: BenchmarkState, action: BenchmarkAction): BenchmarkState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'SET_BENCHMARKS':
      return { ...state, benchmarks: action.payload, isLoading: false }
    case 'ADD_BENCHMARK': {
      const exists = state.benchmarks.find((b) => b.id === action.payload.id)
      if (exists) return state
      return { ...state, benchmarks: [...state.benchmarks, action.payload] }
    }
    case 'UPDATE_BENCHMARK':
      return {
        ...state,
        benchmarks: state.benchmarks.map((b) => (b.id === action.payload.id ? action.payload : b)),
      }
    case 'REMOVE_BENCHMARK':
      return { ...state, benchmarks: state.benchmarks.filter((b) => b.id !== action.payload) }
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload }
    case 'IMPORT_BENCHMARKS': {
      const newBenchmarks = processImportedRuns(action.payload, state.settings.thresholds)
      const merged = [...state.benchmarks]
      for (const nb of newBenchmarks) {
        const idx = merged.findIndex((b) => b.id === nb.id)
        if (idx >= 0) {
          merged[idx] = nb
        } else {
          merged.push(nb)
        }
      }
      return { ...state, benchmarks: merged }
    }
    default:
      return state
  }
}

function processImportedRuns(runs: BenchmarkRun[], thresholds: BenchmarkThresholds): AggregatedWebsiteBenchmark[] {
  const grouped = new Map<string, BenchmarkRun[]>()

  for (const run of runs) {
    const key = `${run.website.domain}-${run.environment.device}-${run.environment.browser}-${run.environment.edgeSightVersion}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(run)
  }

  const benchmarks: AggregatedWebsiteBenchmark[] = []

  for (const [key, websiteRuns] of grouped) {
    const firstRun = websiteRuns[0]
    const aggregatedScores = aggregateScores(websiteRuns, thresholds)

    const pages = Array.from(
      new Map(websiteRuns.map((r) => [r.page.url, r.page])).values()
    )

    const benchmark: AggregatedWebsiteBenchmark = {
      id: key,
      website: firstRun.website,
      environment: firstRun.environment,
      pages,
      runs: websiteRuns,
      aggregatedScores,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSampleData: websiteRuns.some((r) => r.isSampleData),
    }

    benchmarks.push(benchmark)
  }

  return benchmarks
}

const initialSettings: BenchmarkSettings = {
  thresholds: scoringDefaultThresholds,
  updatedAt: new Date().toISOString(),
}

const initialState: BenchmarkState = {
  benchmarks: [],
  settings: initialSettings,
  isLoading: true,
  error: null,
}

const BenchmarkContext = createContext<{
  state: BenchmarkState
  dispatch: React.Dispatch<BenchmarkAction>
  loadBenchmarks: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (settings: BenchmarkSettings) => Promise<void>
  addBenchmark: (benchmark: AggregatedWebsiteBenchmark) => Promise<void>
  updateBenchmark: (benchmark: AggregatedWebsiteBenchmark) => Promise<void>
  deleteBenchmark: (id: string) => Promise<void>
  importRuns: (runs: BenchmarkRun[]) => Promise<void>
  exportBenchmarks: (format: 'json' | 'csv') => Promise<void>
} | null>(null)

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(benchmarkReducer, initialState)

  const loadBenchmarks = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const db = await getDB()
      const benchmarks = await db.getAll('benchmarks')
      dispatch({ type: 'SET_BENCHMARKS', payload: benchmarks })
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load benchmarks' })
    }
  }

  const loadSettings = async () => {
    try {
      const db = await getDB()
      const settings = await db.get('settings', 'benchmark-settings')
      if (settings) {
        dispatch({ type: 'SET_SETTINGS', payload: settings })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveSettings = async (settings: BenchmarkSettings) => {
    const db = await getDB()
    await db.put('settings', { ...settings, key: 'benchmark-settings' })
    dispatch({ type: 'SET_SETTINGS', payload: settings })
  }

  const addBenchmark = async (benchmark: AggregatedWebsiteBenchmark) => {
    const db = await getDB()
    await db.put('benchmarks', benchmark)
    dispatch({ type: 'ADD_BENCHMARK', payload: benchmark })
  }

  const updateBenchmark = async (benchmark: AggregatedWebsiteBenchmark) => {
    const db = await getDB()
    await db.put('benchmarks', { ...benchmark, updatedAt: new Date().toISOString() })
    dispatch({ type: 'UPDATE_BENCHMARK', payload: { ...benchmark, updatedAt: new Date().toISOString() } })
  }

  const deleteBenchmark = async (id: string) => {
    const db = await getDB()
    await db.delete('benchmarks', id)
    dispatch({ type: 'REMOVE_BENCHMARK', payload: id })
  }

  const importRuns = async (runs: BenchmarkRun[]) => {
    const runsWithScores = runs.map((run) => ({
      ...run,
      _scores: calculateAllScores(run, state.settings.thresholds),
    }))
    dispatch({ type: 'IMPORT_BENCHMARKS', payload: runsWithScores as unknown as BenchmarkRun[] })

    const newBenchmarks = processImportedRuns(runs, state.settings.thresholds)
    const db = await getDB()
    for (const benchmark of newBenchmarks) {
      await db.put('benchmarks', benchmark)
    }
  }

  const exportBenchmarks = async (format: 'json' | 'csv') => {
    const data = state.benchmarks.map((b) => ({
      website: b.website,
      environment: b.environment,
      pages: b.pages,
      runs: b.runs.map((r) => ({
        ...r,
        _scores: calculateAllScores(r, state.settings.thresholds),
      })),
      aggregatedScores: b.aggregatedScores,
      createdAt: b.createdAt,
      isSampleData: b.isSampleData,
    }))

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `edgesight-benchmarks-${new Date().toISOString().split('T')[0]}.json`)
    } else {
      const csv = convertToCSV(data)
      const blob = new Blob([csv], { type: 'text/csv' })
      downloadBlob(blob, `edgesight-benchmarks-${new Date().toISOString().split('T')[0]}.csv`)
    }
  }

  useEffect(() => {
    loadBenchmarks()
    loadSettings()
  }, [])

  return (
    <BenchmarkContext.Provider
      value={{
        state,
        dispatch,
        loadBenchmarks,
        loadSettings,
        saveSettings,
        addBenchmark,
        updateBenchmark,
        deleteBenchmark,
        importRuns,
        exportBenchmarks,
      }}
    >
      {children}
    </BenchmarkContext.Provider>
  )
}

export function useBenchmark() {
  const context = useContext(BenchmarkContext)
  if (!context) {
    throw new Error('useBenchmark must be used within a BenchmarkProvider')
  }
  return context
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function convertToCSV(data: Array<{
  website: { name: string; domain: string }
  environment: { device: string; cpu: string; ramGB: number; gpu?: string; os: string; browser: string; browserVersion: string; edgeSightVersion: string; visionModel: string }
  pages: Array<{ name: string; url: string }>
  runs: Array<any>
  aggregatedScores: any
  createdAt: string
  isSampleData: boolean
}>): string {
  if (data.length === 0) return ''

  const headers = [
    'Website Name',
    'Domain',
    'Device',
    'CPU',
    'RAM (GB)',
    'OS',
    'Browser',
    'Browser Version',
    'EdgeSight Version',
    'Vision Model',
    'Pages Tested',
    'Total Runs',
    'Visual Score',
    'PII Precision',
    'PII Recall',
    'PII F1',
    'Redaction Precision',
    'Redaction Recall',
    'Redaction F1',
    'Avg IoU',
    'Latency Score',
    'CPU Score',
    'RAM Score',
    'Resource Score',
    'Payload Reduction %',
    'Overall Score',
    'PII Leakage Rate %',
    'PII Leakage Status',
    'Benchmark Date',
    'Sample Data',
  ]

  const rows = data.map((b) => [
    b.website.name,
    b.website.domain,
    b.environment.device,
    b.environment.cpu,
    b.environment.ramGB,
    b.environment.os,
    b.environment.browser,
    b.environment.browserVersion,
    b.environment.edgeSightVersion,
    b.environment.visionModel,
    b.pages.length,
    b.runs.length,
    b.aggregatedScores.visualScore.toFixed(2),
    b.aggregatedScores.piiPrecision.toFixed(2),
    b.aggregatedScores.piiRecall.toFixed(2),
    b.aggregatedScores.piiF1.toFixed(2),
    b.aggregatedScores.redactionPrecision.toFixed(2),
    b.aggregatedScores.redactionRecall.toFixed(2),
    b.aggregatedScores.redactionF1.toFixed(2),
    b.aggregatedScores.averageIoU?.toFixed(4) ?? 'N/A',
    b.aggregatedScores.latencyScore.toFixed(2),
    b.aggregatedScores.cpuScore.toFixed(2),
    b.aggregatedScores.ramScore.toFixed(2),
    b.aggregatedScores.resourceScore.toFixed(2),
    b.aggregatedScores.payloadReduction.toFixed(2),
    b.aggregatedScores.overallScore.toFixed(2),
    b.aggregatedScores.piiLeakageRate.toFixed(2),
    b.aggregatedScores.piiLeakageStatus,
    new Date(b.createdAt).toLocaleDateString(),
    b.isSampleData ? 'YES' : 'NO',
  ])

  return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
}