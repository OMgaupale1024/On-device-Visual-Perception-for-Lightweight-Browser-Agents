# EdgeSight Analytics

**Privacy & Performance Benchmarking for Browser Agents**

A professional analytical dashboard for evaluating EdgeSight browser agent performance across websites. Built for Smart India Hackathon 2026 (SIH26171) - ISRO.

## Overview

EdgeSight Analytics is a standalone dashboard that quantifies how well the EdgeSight privacy-preserving browser AI agent performs on different websites. It computes a comprehensive **EdgeSight Benchmark Score** (0-100) based on five weighted dimensions defined by SIH evaluation criteria.

### Key Features

- **Comprehensive Scoring**: 5-dimension weighted scoring (Visual 25%, PII 20%, Redaction 20%, Resources 20%, Latency 15%)
- **Privacy-First**: Prominent PII leakage tracking with "PRIVACY FAILURE" warnings
- **Multi-Website Comparison**: Side-by-side benchmark comparison with grouped bar and radar charts
- **Detailed Analysis**: Per-run drill-down with latency breakdown, resource usage, OCR analytics
- **Data Import/Export**: JSON file import, CSV/JSON export
- **Local Persistence**: IndexedDB storage (no backend required)
- **Sample Data**: Pre-loaded demo data clearly marked as "SAMPLE DATA"

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
cd edgesight-analytics
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:5173

### Build

```bash
npm run build
```

### Run Tests

```bash
npm run test
```

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard Overview | `/` | Main KPI cards, score breakdown, recent runs |
| Website Comparison | `/comparison` | Multi-site comparison table & charts |
| Website Details | `/website/:id` | Deep dive into single website |
| Run Details | `/run/:websiteId/:runIndex` | Individual run analysis |
| Import Benchmark | `/import` | Upload JSON benchmark data |
| Settings | `/settings` | Configure scoring thresholds |

## Importing Benchmark Data

### JSON Format

The dashboard accepts EdgeSight benchmark JSON with this schema:

```json
{
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
}
```

### Import Methods

1. **Drag & Drop**: Drop `.json` file on the Import page
2. **File Picker**: Click "Browse Files" on the Import page
3. **Multiple Runs**: Import arrays of runs or objects with `runs` array
4. **Auto-Grouping**: Runs are automatically grouped by website + environment

### Sample Data

Click "Load Sample Data" on the empty dashboard to populate with 7 demo websites:
- Government Portal (3 pages × 3 runs)
- Banking Website (2 pages × 2 runs)
- Healthcare Portal (1 page × 1 run)
- E-commerce Site (1 page × 1 run)
- Enterprise Dashboard (1 page × 1 run)

All sample data is clearly marked with **"SAMPLE DATA"** badges.

## Scoring System

### EdgeSight Benchmark Score Formula

```
Overall Score =
  (VisualScore × 0.25) +
  (PIIScore × 0.20) +
  (RedactionScore × 0.20) +
  (ResourceScore × 0.20) +
  (LatencyScore × 0.15)
```

### Component Scores

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Visual Context | 25% | `correctElements / expectedElements × 100` |
| PII Detection | 20% | F1 = 2 × Precision × Recall / (Precision + Recall) |
| Redaction | 20% | F1 = 2 × Precision × Recall / (Precision + Recall) |
| Resources | 20% | (CPU Score + RAM Score) / 2 |
| Latency | 15% | Threshold-based (see below) |

### Latency Thresholds (EdgeSight Benchmark Thresholds)

| Total Latency | Score |
|---------------|-------|
| ≤ 1.0 sec | 100 |
| 1.0–1.5 sec | 90 |
| 1.5–2.0 sec | 80 |
| 2.0–3.0 sec | 70 |
| 3.0–4.0 sec | 50 |
| > 4.0 sec | 30 |

### Resource Thresholds (EdgeSight Benchmark Thresholds)

**CPU (Average %)**:
- ≤ 20% = 100
- ≤ 35% = 90
- ≤ 50% = 80
- ≤ 65% = 65
- > 65% = 45

**RAM (Average MB)**:
- ≤ 250 MB = 100
- ≤ 400 MB = 90
- ≤ 600 MB = 80
- ≤ 800 MB = 65
- > 800 MB = 45

### Status Levels

| Score | Status |
|-------|--------|
| 90–100 | Excellent |
| 80–89 | Good |
| 70–79 | Moderate |
| < 70 | Needs Improvement |

### Privacy Status (Separate from Score)

| Condition | Status |
|-----------|--------|
| 0 PII leaked | **SAFE** |
| > 0 PII leaked | **PRIVACY FAILURE** ⚠️ |

Privacy failure is always prominently displayed regardless of overall score.

## Architecture

```
src/
├── components/
│   ├── ui/           # Reusable UI components (Button, Card, Badge, Input, etc.)
│   ├── charts/       # Chart components (GroupedBarChart, RadarChart, LineChart, PieChart)
│   └── layout/       # Layout components (Sidebar, Header, Layout)
├── pages/            # Page components (Dashboard, Comparison, Details, Import, Settings)
├── services/
│   └── BenchmarkContext.tsx  # Global state + IndexedDB persistence
├── scoring/          # Centralized scoring engine (pure functions)
├── types/            # TypeScript interfaces
├── utils/            # Formatting utilities
├── data/             # Sample data
└── styles/           # Tailwind CSS + custom styles
```

### Data Flow

```
JSON Import → BenchmarkContext → IndexedDB → Pages → Scoring Engine → UI
                     ↓
              Settings (thresholds)
```

### Scoring Engine

All calculations in `src/scoring/index.ts` - pure functions, no React dependencies:

```typescript
calculateVisualScore(run)
calculatePIIPrecision(run)
calculatePIIRecall(run)
calculatePIIF1(run)
calculateRedactionPrecision(run)
calculateRedactionRecall(run)
calculateRedactionF1(run)
calculateIoU(run)
calculateLatencyScore(run, thresholds)
calculateCPUScore(run, thresholds)
calculateRAMScore(run, thresholds)
calculateResourceScore(run, thresholds)
calculatePayloadReduction(run)
calculatePIILeakageRate(run)
calculatePIILeakageStatus(run)
calculateOverallBenchmarkScore(run, thresholds)
calculateAllScores(run, thresholds)
aggregateScores(runs[], thresholds)
getScoreStatus(score)
```

All functions handle edge cases: division by zero, missing data, null values.

## Connecting to EdgeSight Backend

The dashboard is designed for easy backend integration:

### 1. Replace IndexedDB with API

In `src/services/BenchmarkContext.tsx`, replace the `getDB()` IndexedDB calls with API calls:

```typescript
// Instead of IndexedDB
const response = await fetch('/api/benchmarks')
const benchmarks = await response.json()

// Instead of db.put()
await fetch('/api/benchmarks', {
  method: 'POST',
  body: JSON.stringify(benchmark)
})
```

### 2. Repository Pattern

The `BenchmarkContext` already abstracts storage behind:
- `loadBenchmarks()`
- `addBenchmark()`
- `updateBenchmark()`
- `deleteBenchmark()`
- `importRuns()`
- `exportBenchmarks()`

Replace these implementations with API calls - UI components remain unchanged.

### 3. Real-time Updates

Add WebSocket/SSE for live benchmark updates:

```typescript
useEffect(() => {
  const ws = new WebSocket('/api/ws')
  ws.onmessage = (event) => {
    const benchmark = JSON.parse(event.data)
    dispatch({ type: 'ADD_BENCHMARK', payload: benchmark })
  }
  return () => ws.close()
}, [])
```

## Privacy Compliance

The dashboard follows EdgeSight's privacy philosophy:

- **No raw PII stored**: Only category counts (tp/fp/fn), bounding boxes, redacted placeholders
- **Local-first**: All data stays in browser IndexedDB
- **No screenshots**: Only metrics and anonymous identifiers
- **Export sanitization**: Exports contain only aggregated metrics

## Tech Stack

- **React 18** + TypeScript
- **Vite** for fast development
- **Tailwind CSS** for styling
- **Recharts** for visualizations
- **IndexedDB (idb)** for persistence
- **React Router** for navigation
- **Vitest** for unit testing

## Project Structure

```
edgesight-analytics/
├── public/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── charts/
│   │   └── layout/
│   ├── pages/
│   ├── services/
│   ├── scoring/
│   ├── types/
│   ├── utils/
│   ├── data/
│   └── styles/
├── tests/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## License

Built for Smart India Hackathon 2026 - ISRO Problem Statement SIH26171.