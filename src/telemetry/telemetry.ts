import * as vscode from 'vscode'

// ─── Event types ──────────────────────────────────────────────────────────────
// Structured events — each has a type discriminant for exhaustive handling.
// Pattern mirrors how Amazon tracks operational metrics (CloudWatch dimensions).

export type TelemetryEvent =
  | { type: 'generation_started'; source: GenerationSource; timestamp: number }
  | {
      type: 'generation_completed'
      source: GenerationSource
      filesCreated: number
      foldersCreated: number
      durationMs: number
      fromCache: boolean
      timestamp: number
    }
  | {
      type: 'generation_failed'
      source: GenerationSource
      errorCode: ErrorCode
      durationMs: number
      timestamp: number
    }
  | { type: 'cache_hit'; source: GenerationSource; timestamp: number }
  | {
      type: 'api_call'
      source: GenerationSource
      latencyMs: number
      success: boolean
      timestamp: number
    }

export type GenerationSource = 'template' | 'image' | 'text'

export type ErrorCode =
  | 'API_ERROR'
  | 'PARSE_ERROR'
  | 'FILE_SYSTEM_ERROR'
  | 'PATH_TRAVERSAL'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'USER_CANCELLED'

// ─── In-memory ring buffer for events ────────────────────────────────────────
// Ring buffer: O(1) insert, bounded memory, no dynamic resizing.
// Stores last N events for the session summary.

const RING_SIZE = 200

class RingBuffer<T> {
  private buf: (T | undefined)[]
  private head = 0
  private count = 0

  constructor(size: number) {
    this.buf = new Array(size)
  }

  push(item: T): void {
    this.buf[this.head % this.buf.length] = item
    this.head++
    if (this.count < this.buf.length) this.count++
  }

  toArray(): T[] {
    const size = this.buf.length
    const result: T[] = []
    const start = this.count < size ? 0 : this.head % size
    for (let i = 0; i < this.count; i++) {
      const val = this.buf[(start + i) % size]
      if (val !== undefined) result.push(val)
    }
    return result
  }

  get length() {
    return this.count
  }
}

// ─── Session metrics aggregator ───────────────────────────────────────────────

interface SessionMetrics {
  totalGenerations: number
  successfulGenerations: number
  failedGenerations: number
  totalFilesCreated: number
  cacheHits: number
  averageLatencyMs: number
  p95LatencyMs: number // 95th percentile — Amazon standard SLA metric
  errorBreakdown: Record<ErrorCode, number>
  sourceBreakdown: Record<GenerationSource, number>
}

// ─── Telemetry service (singleton) ───────────────────────────────────────────

class TelemetryService {
  private events = new RingBuffer<TelemetryEvent>(RING_SIZE)
  private latencies: number[] = []
  private metrics: SessionMetrics = {
    totalGenerations: 0,
    successfulGenerations: 0,
    failedGenerations: 0,
    totalFilesCreated: 0,
    cacheHits: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    errorBreakdown: {} as Record<ErrorCode, number>,
    sourceBreakdown: { template: 0, image: 0, text: 0 },
  }

  record(event: TelemetryEvent): void {
    this.events.push(event)
    this.updateMetrics(event)
  }

  private updateMetrics(event: TelemetryEvent): void {
    switch (event.type) {
      case 'generation_started':
        this.metrics.totalGenerations++
        this.metrics.sourceBreakdown[event.source]++
        break

      case 'generation_completed':
        this.metrics.successfulGenerations++
        this.metrics.totalFilesCreated += event.filesCreated
        if (event.fromCache) this.metrics.cacheHits++
        this.recordLatency(event.durationMs)
        break

      case 'generation_failed':
        this.metrics.failedGenerations++
        this.metrics.errorBreakdown[event.errorCode] =
          (this.metrics.errorBreakdown[event.errorCode] ?? 0) + 1
        break

      case 'cache_hit':
        this.metrics.cacheHits++
        break

      case 'api_call':
        if (event.success) this.recordLatency(event.latencyMs)
        break
    }
  }

  private recordLatency(ms: number): void {
    this.latencies.push(ms)
    // Recalculate rolling average
    const sum = this.latencies.reduce((a, b) => a + b, 0)
    this.metrics.averageLatencyMs = Math.round(sum / this.latencies.length)
    // P95 — sort and take 95th percentile index
    if (this.latencies.length >= 5) {
      const sorted = [...this.latencies].sort((a, b) => a - b)
      const idx = Math.ceil(sorted.length * 0.95) - 1
      this.metrics.p95LatencyMs = sorted[Math.min(idx, sorted.length - 1)]
    }
  }

  getMetrics(): Readonly<SessionMetrics> {
    return { ...this.metrics }
  }

  getRecentEvents(n = 10): TelemetryEvent[] {
    return this.events.toArray().slice(-n)
  }

  // Format a human-readable session summary for status bar / output channel
  formatSummary(): string {
    const m = this.metrics
    const successRate =
      m.totalGenerations === 0
        ? '—'
        : `${Math.round((m.successfulGenerations / m.totalGenerations) * 100)}%`

    return [
      `VibeFiles Session Summary`,
      `─────────────────────────`,
      `Generations : ${m.totalGenerations} total, ${m.successfulGenerations} ok, ${m.failedGenerations} failed`,
      `Success rate: ${successRate}`,
      `Files created: ${m.totalFilesCreated}`,
      `Cache hits  : ${m.cacheHits}`,
      `Avg latency : ${m.averageLatencyMs}ms  |  P95: ${m.p95LatencyMs}ms`,
      `Sources     : template=${m.sourceBreakdown.template} image=${m.sourceBreakdown.image} text=${m.sourceBreakdown.text}`,
    ].join('\n')
  }
}

export const telemetry = new TelemetryService()

// ─── Status bar integration ───────────────────────────────────────────────────
// Shows live stats in VSCode status bar bottom-right

let statusBarItem: vscode.StatusBarItem | undefined

export function initStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  statusBarItem.command = 'vibefiles.showStats'
  statusBarItem.text = '$(zap) VibeFiles'
  statusBarItem.tooltip = 'Click to view VibeFiles session stats'
  statusBarItem.show()
  context.subscriptions.push(statusBarItem)
}

export function updateStatusBar(filesCreated: number): void {
  if (!statusBarItem) return
  const m = telemetry.getMetrics()
  statusBarItem.text = `$(zap) VibeFiles · ${m.totalFilesCreated} files`
  statusBarItem.tooltip = `${m.totalGenerations} generations · ${m.cacheHits} cache hits · avg ${m.averageLatencyMs}ms`
}
