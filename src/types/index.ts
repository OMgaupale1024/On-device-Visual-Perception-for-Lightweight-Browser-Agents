export interface Website {
  name: string;
  domain: string;
}

export interface Environment {
  device: string;
  cpu: string;
  ramGB: number;
  gpu?: string;
  os: string;
  browser: string;
  browserVersion: string;
  edgeSightVersion: string;
  visionModel: string;
}

export interface Page {
  name: string;
  url: string;
}

export interface Run {
  runNumber: number;
  timestamp: string;
}

export interface GroundTruth {
  expectedElements: number;
  expectedPII: number;
  expectedRedactions: number;
}

export interface VisualMetrics {
  correctElements: number;
  domAccuracy?: number | null;
  visionAccuracy?: number | null;
  fusionAccuracy?: number | null;
}

export interface PIIMetrics {
  tp: number;
  fp: number;
  fn: number;
  outboundLeakCount: number;
}

export interface RedactionMetrics {
  tp: number;
  fp: number;
  fn: number;
  averageIoU?: number | null;
}

export interface OCRMetrics {
  detections: number;
  accepted: number;
  rejected: number;
  averageConfidence: number;
}

export interface TimingsMs {
  screenCapture: number;
  dom: number;
  vision: number;
  pii: number;
  redaction: number;
  privacyGuard: number;
  server: number;
  action: number;
  total: number;
}

export interface CPUMetrics {
  average: number;
  peak: number;
}

export interface RAMMetrics {
  average: number;
  peak: number;
}

export interface PerformanceMetrics {
  coldRun: boolean;
  timingsMs: TimingsMs;
  cpu: CPUMetrics;
  ramMB: RAMMetrics;
  gpuAverage?: number | null;
}

export interface AgentMetrics {
  tasksAttempted: number;
  tasksCompleted: number;
  correctActions: number;
  incorrectActions: number;
}

export interface NetworkMetrics {
  rawPayloadBytes: number;
  sanitizedPayloadBytes: number;
}

export interface BenchmarkRun {
  website: Website;
  environment: Environment;
  page: Page;
  run: Run;
  groundTruth: GroundTruth;
  visual: VisualMetrics;
  pii: PIIMetrics;
  redaction: RedactionMetrics;
  ocr: OCRMetrics;
  performance: PerformanceMetrics;
  agent: AgentMetrics;
  network: NetworkMetrics;
  isSampleData?: boolean;
}

export interface BenchmarkScores {
  visualScore: number;
  piiPrecision: number;
  piiRecall: number;
  piiF1: number;
  redactionPrecision: number;
  redactionRecall: number;
  redactionF1: number;
  averageIoU: number | null;
  latencyScore: number;
  cpuScore: number;
  ramScore: number;
  resourceScore: number;
  payloadReduction: number;
  overallScore: number;
  piiLeakageRate: number;
  piiLeakageStatus: 'SAFE' | 'PRIVACY_FAILURE';
}

export interface AggregatedWebsiteBenchmark {
  id: string;
  website: Website;
  environment: Environment;
  pages: Page[];
  runs: BenchmarkRun[];
  aggregatedScores: BenchmarkScores;
  createdAt: string;
  updatedAt: string;
  isSampleData: boolean;
}

export interface BenchmarkThresholds {
  latency: LatencyThresholds;
  cpu: CPUThresholds;
  ram: RAMThresholds;
  ocrConfidenceThreshold: number;
  runsPerPage: number;
}

export interface LatencyThresholds {
  excellent: number;
  good: number;
  moderate: number;
  fair: number;
  poor: number;
  fail: number;
}

export interface CPUThresholds {
  excellent: number;
  good: number;
  moderate: number;
  fair: number;
}

export interface RAMThresholds {
  excellent: number;
  good: number;
  moderate: number;
  fair: number;
}

export interface BenchmarkSettings {
  thresholds: BenchmarkThresholds;
  updatedAt: string;
  key?: string;
}

export type ScoreStatus = 'Excellent' | 'Good' | 'Moderate' | 'Needs Improvement';

export interface ScoreBreakdown {
  score: number;
  status: ScoreStatus;
  weight: number;
  label: string;
}

export interface ComparisonDataPoint {
  websiteName: string;
  visualScore: number;
  piiScore: number;
  redactionScore: number;
  resourceScore: number;
  latencyScore: number;
  overallScore: number;
  piiLeakage: number;
}

export interface PIICategoryBreakdown {
  category: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface LatencyBreakdown {
  label: string;
  value: number;
  percentage: number;
}

export interface ResourceChartData {
  timestamp: string;
  cpu: number;
  ram: number;
  gpu?: number;
}

export interface OCRConfidenceDistribution {
  range: string;
  count: number;
  percentage: number;
}

export interface DOMVisionFusionComparison {
  category: string;
  domAccuracy: number | null;
  visionAccuracy: number | null;
  fusionAccuracy: number | null;
}

export interface ActionBreakdown {
  action: string;
  count: number;
  successRate: number;
}