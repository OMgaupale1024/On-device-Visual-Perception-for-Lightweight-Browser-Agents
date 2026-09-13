import type {
  BenchmarkRun,
  BenchmarkScores,
  BenchmarkThresholds,
  ScoreStatus,
} from '../types';

export const DEFAULT_THRESHOLDS: BenchmarkThresholds = {
  latency: {
    excellent: 1000,
    good: 1500,
    moderate: 2000,
    fair: 3000,
    poor: 4000,
    fail: 5000,
  },
  cpu: {
    excellent: 20,
    good: 35,
    moderate: 50,
    fair: 65,
  },
  ram: {
    excellent: 250,
    good: 400,
    moderate: 600,
    fair: 800,
  },
  ocrConfidenceThreshold: 70,
  runsPerPage: 5,
};

export function calculateVisualScore(run: BenchmarkRun): number {
  const { expectedElements } = run.groundTruth;
  const { correctElements } = run.visual;

  if (expectedElements <= 0) return 0;
  if (correctElements < 0) return 0;

  const score = (correctElements / expectedElements) * 100;
  return Math.min(Math.max(score, 0), 100);
}

export function calculatePIIPrecision(run: BenchmarkRun): number {
  const { tp, fp } = run.pii;
  const denominator = tp + fp;
  if (denominator <= 0) return 0;
  return (tp / denominator) * 100;
}

export function calculatePIIRecall(run: BenchmarkRun): number {
  const { tp, fn } = run.pii;
  const denominator = tp + fn;
  if (denominator <= 0) return 0;
  return (tp / denominator) * 100;
}

export function calculatePIIF1(run: BenchmarkRun): number {
  const precision = calculatePIIPrecision(run) / 100;
  const recall = calculatePIIRecall(run) / 100;

  if (precision + recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall) * 100;
}

export function calculateRedactionPrecision(run: BenchmarkRun): number {
  const { tp, fp } = run.redaction;
  const denominator = tp + fp;
  if (denominator <= 0) return 0;
  return (tp / denominator) * 100;
}

export function calculateRedactionRecall(run: BenchmarkRun): number {
  const { tp, fn } = run.redaction;
  const denominator = tp + fn;
  if (denominator <= 0) return 0;
  return (tp / denominator) * 100;
}

export function calculateRedactionF1(run: BenchmarkRun): number {
  const precision = calculateRedactionPrecision(run) / 100;
  const recall = calculateRedactionRecall(run) / 100;

  if (precision + recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall) * 100;
}

export function calculateIoU(run: BenchmarkRun): number | null {
  return run.redaction.averageIoU ?? null;
}

export function calculateLatencyScore(
  run: BenchmarkRun,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS
): number {
  const totalMs = run.performance.timingsMs.total;
  const { latency } = thresholds;

  if (totalMs <= latency.excellent) return 100;
  if (totalMs <= latency.good) return 90;
  if (totalMs <= latency.moderate) return 80;
  if (totalMs <= latency.fair) return 70;
  if (totalMs <= latency.poor) return 50;
  return 30;
}

export function calculateCPUScore(
  run: BenchmarkRun,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS
): number {
  const avgCpu = run.performance.cpu.average;
  const { cpu } = thresholds;

  if (avgCpu <= cpu.excellent) return 100;
  if (avgCpu <= cpu.good) return 90;
  if (avgCpu <= cpu.moderate) return 80;
  if (avgCpu <= cpu.fair) return 65;
  return 45;
}

export function calculateRAMScore(
  run: BenchmarkRun,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS
): number {
  const avgRam = run.performance.ramMB.average;
  const { ram } = thresholds;

  if (avgRam <= ram.excellent) return 100;
  if (avgRam <= ram.good) return 90;
  if (avgRam <= ram.moderate) return 80;
  if (avgRam <= ram.fair) return 65;
  return 45;
}

export function calculateResourceScore(run: BenchmarkRun, thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS): number {
  const cpuScore = calculateCPUScore(run, thresholds);
  const ramScore = calculateRAMScore(run, thresholds);
  return (cpuScore + ramScore) / 2;
}

export function calculatePayloadReduction(run: BenchmarkRun): number {
  const { rawPayloadBytes, sanitizedPayloadBytes } = run.network;

  if (rawPayloadBytes <= 0) return 0;
  if (sanitizedPayloadBytes < 0) return 0;

  const reduction = (1 - sanitizedPayloadBytes / rawPayloadBytes) * 100;
  return Math.min(Math.max(reduction, 0), 100);
}

export function calculatePIILeakageRate(run: BenchmarkRun): number {
  const { outboundLeakCount } = run.pii;
  const { expectedPII } = run.groundTruth;

  if (expectedPII <= 0) return 0;
  return (outboundLeakCount / expectedPII) * 100;
}

export function calculatePIILeakageStatus(run: BenchmarkRun): 'SAFE' | 'PRIVACY_FAILURE' {
  return run.pii.outboundLeakCount > 0 ? 'PRIVACY_FAILURE' : 'SAFE';
}

export function calculateOverallBenchmarkScore(
  run: BenchmarkRun,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS
): number {
  const visualScore = calculateVisualScore(run);
  const piiScore = calculatePIIF1(run);
  const redactionScore = calculateRedactionF1(run);
  const resourceScore = calculateResourceScore(run, thresholds);
  const latencyScore = calculateLatencyScore(run, thresholds);

  const overall =
    visualScore * 0.25 +
    piiScore * 0.20 +
    redactionScore * 0.20 +
    resourceScore * 0.20 +
    latencyScore * 0.15;

  return Math.min(Math.max(overall, 0), 100);
}

export function calculateAllScores(
  run: BenchmarkRun,
  thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS
): BenchmarkScores {
  const visualScore = calculateVisualScore(run);
  const piiPrecision = calculatePIIPrecision(run);
  const piiRecall = calculatePIIRecall(run);
  const piiF1 = calculatePIIF1(run);
  const redactionPrecision = calculateRedactionPrecision(run);
  const redactionRecall = calculateRedactionRecall(run);
  const redactionF1 = calculateRedactionF1(run);
  const averageIoU = calculateIoU(run);
  const latencyScore = calculateLatencyScore(run, thresholds);
  const cpuScore = calculateCPUScore(run, thresholds);
  const ramScore = calculateRAMScore(run, thresholds);
  const resourceScore = calculateResourceScore(run, thresholds);
  const payloadReduction = calculatePayloadReduction(run);
  const overallScore = calculateOverallBenchmarkScore(run, thresholds);
  const piiLeakageRate = calculatePIILeakageRate(run);
  const piiLeakageStatus = calculatePIILeakageStatus(run);

  return {
    visualScore,
    piiPrecision,
    piiRecall,
    piiF1,
    redactionPrecision,
    redactionRecall,
    redactionF1,
    averageIoU,
    latencyScore,
    cpuScore,
    ramScore,
    resourceScore,
    payloadReduction,
    overallScore,
    piiLeakageRate,
    piiLeakageStatus,
  };
}

export function getScoreStatus(score: number): ScoreStatus {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Moderate';
  return 'Needs Improvement';
}

export function getScoreColor(score: number): string {
  const status = getScoreStatus(score);
  switch (status) {
    case 'Excellent':
      return 'text-green-400';
    case 'Good':
      return 'text-blue-400';
    case 'Moderate':
      return 'text-yellow-400';
    case 'Needs Improvement':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

export function getScoreBgColor(score: number): string {
  const status = getScoreStatus(score);
  switch (status) {
    case 'Excellent':
      return 'bg-green-500/20 border-green-500/30';
    case 'Good':
      return 'bg-blue-500/20 border-blue-500/30';
    case 'Moderate':
      return 'bg-yellow-500/20 border-yellow-500/30';
    case 'Needs Improvement':
      return 'bg-red-500/20 border-red-500/30';
    default:
      return 'bg-gray-500/20 border-gray-500/30';
  }
}

export function aggregateScores(runs: BenchmarkRun[], thresholds: BenchmarkThresholds = DEFAULT_THRESHOLDS): BenchmarkScores {
  if (runs.length === 0) {
    return createEmptyScores();
  }

  const allScores = runs.map((run) => calculateAllScores(run, thresholds));

  const avg = (key: keyof BenchmarkScores) => {
    const values = allScores.map((s) => s[key]).filter((v) => typeof v === 'number') as number[];
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  };

  const avgIoU = allScores.map((s) => s.averageIoU).filter((v): v is number => v !== null);
  const averageIoU = avgIoU.length > 0 ? avgIoU.reduce((a, b) => a + b, 0) / avgIoU.length : null;

  const piiLeakageStatuses = allScores.map((s) => s.piiLeakageStatus);
  const piiLeakageStatus = piiLeakageStatuses.includes('PRIVACY_FAILURE') ? 'PRIVACY_FAILURE' : 'SAFE';

  const piiLeakageRates = allScores.map((s) => s.piiLeakageRate);
  const piiLeakageRate = piiLeakageRates.reduce((a, b) => a + b, 0) / piiLeakageRates.length;

  return {
    visualScore: avg('visualScore'),
    piiPrecision: avg('piiPrecision'),
    piiRecall: avg('piiRecall'),
    piiF1: avg('piiF1'),
    redactionPrecision: avg('redactionPrecision'),
    redactionRecall: avg('redactionRecall'),
    redactionF1: avg('redactionF1'),
    averageIoU,
    latencyScore: avg('latencyScore'),
    cpuScore: avg('cpuScore'),
    ramScore: avg('ramScore'),
    resourceScore: avg('resourceScore'),
    payloadReduction: avg('payloadReduction'),
    overallScore: avg('overallScore'),
    piiLeakageRate,
    piiLeakageStatus,
  };
}

function createEmptyScores(): BenchmarkScores {
  return {
    visualScore: 0,
    piiPrecision: 0,
    piiRecall: 0,
    piiF1: 0,
    redactionPrecision: 0,
    redactionRecall: 0,
    redactionF1: 0,
    averageIoU: null,
    latencyScore: 0,
    cpuScore: 0,
    ramScore: 0,
    resourceScore: 0,
    payloadReduction: 0,
    overallScore: 0,
    piiLeakageRate: 0,
    piiLeakageStatus: 'SAFE',
  };
}