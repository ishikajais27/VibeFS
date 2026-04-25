import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { TemplateTree } from '../templates'
import { createStructure, rollbackStructure } from '../utils/fileSystem'
import { pickTargetFolder, runGeneration } from './generate'
import { imageAnalysisCache, hashString } from '../cache/lruCache'
import { telemetry } from '../telemetry/telemetry'

const SERVER_URL = 'https://vibe-fs-server.vercel.app/api/analyze'

// ─── Retry with exponential backoff ──────────────────────────────────────────
// Retries transient failures (5xx, network errors) using exponential backoff
// with jitter — standard approach for distributed systems resilience.
//
// Backoff formula: min(base * 2^attempt + jitter, maxDelayMs)
// Jitter prevents "thundering herd" — all clients retrying at the same time.
//
// Not retried: 4xx errors (client errors are not transient)

interface RetryConfig {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  timeoutMs: number
}

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  timeoutMs: 30_000, // 30 second total timeout per attempt
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number): boolean {
  // 429 = rate limited, 5xx = server errors — retry these
  return status === 429 || (status >= 500 && status <= 599)
}

async function fetchWithRetry(
  url: string,
  body: object,
  config: RetryConfig = DEFAULT_RETRY,
): Promise<{ result?: string; error?: string }> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    // Exponential backoff with jitter (skip delay on first attempt)
    if (attempt > 0) {
      const base = config.baseDelayMs * Math.pow(2, attempt - 1)
      const jitter = Math.random() * config.baseDelayMs
      const delay = Math.min(base + jitter, config.maxDelayMs)
      await sleep(delay)
    }

    const attemptStart = Date.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const latencyMs = Date.now() - attemptStart

      if (!response.ok) {
        if (!isRetryableStatus(response.status)) {
          // 4xx — don't retry, throw immediately
          const errorBody = await response.text()
          telemetry.record({
            type: 'api_call',
            source: 'image',
            latencyMs,
            success: false,
            timestamp: Date.now(),
          })
          throw new Error(`Server error ${response.status}: ${errorBody}`)
        }
        // Retryable error — log and continue loop
        lastError = new Error(
          `Server error ${response.status} (attempt ${attempt + 1}/${config.maxAttempts})`,
        )
        telemetry.record({
          type: 'api_call',
          source: 'image',
          latencyMs,
          success: false,
          timestamp: Date.now(),
        })
        continue
      }

      telemetry.record({
        type: 'api_call',
        source: 'image',
        latencyMs,
        success: true,
        timestamp: Date.now(),
      })
      return (await response.json()) as { result?: string; error?: string }
    } catch (err) {
      clearTimeout(timeoutId)
      const latencyMs = Date.now() - attemptStart

      if (err instanceof Error && err.name === 'AbortError') {
        telemetry.record({
          type: 'api_call',
          source: 'image',
          latencyMs,
          success: false,
          timestamp: Date.now(),
        })
        lastError = new Error(
          `Request timed out after ${config.timeoutMs}ms (attempt ${attempt + 1}/${config.maxAttempts})`,
        )
        continue
      }
      // Network error — retryable
      lastError = err instanceof Error ? err : new Error(String(err))
      telemetry.record({
        type: 'api_call',
        source: 'image',
        latencyMs,
        success: false,
        timestamp: Date.now(),
      })
    }
  }

  throw lastError ?? new Error('All retry attempts failed')
}

// ─── Parse AI response into TemplateTree ─────────────────────────────────────

function parseTreeResponse(text: string): TemplateTree {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as TemplateTree
  } catch {
    throw new Error(
      `Failed to parse AI response as JSON.\n\nRaw response (first 500 chars):\n${text.slice(0, 500)}`,
    )
  }
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function generateFromImage(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Step 1: Pick image file
  const imageUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Select Image',
    title: 'VibeFiles — Pick Image of Project Structure',
    filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
  })
  if (!imageUris || imageUris.length === 0) return

  const imagePath = imageUris[0].fsPath
  const ext = path.extname(imagePath).toLowerCase().replace('.', '')
  const mediaTypeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  const mediaType = mediaTypeMap[ext]
  if (!mediaType) {
    vscode.window.showErrorMessage(`VibeFiles: Unsupported image type: ${ext}`)
    return
  }

  // Step 2: Pick target folder
  const targetPath = await pickTargetFolder()
  if (!targetPath) return

  let tree: TemplateTree
  let fromCache = false

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'VibeFiles: Analyzing image...',
        cancellable: false,
      },
      async (progress) => {
        // Read image and compute cache key
        progress.report({ message: 'Reading image...' })
        const imageBuffer = fs.readFileSync(imagePath)
        const imageBase64 = imageBuffer.toString('base64')

        // Cache key = hash of base64 content (same image = same hash)
        const cacheKey = hashString(imageBase64)

        // Cache lookup — avoids redundant API call for the same image
        const cached = imageAnalysisCache.get(cacheKey)
        if (cached) {
          telemetry.record({
            type: 'cache_hit',
            source: 'image',
            timestamp: Date.now(),
          })
          tree = cached
          fromCache = true
          progress.report({ message: 'Found in cache ⚡' })
          return
        }

        // API call with retry + timeout
        progress.report({ message: 'Calling AI (attempt 1/3)...' })
        const data = await fetchWithRetry(SERVER_URL, {
          imageBase64,
          mediaType,
        })

        if (data.error) throw new Error(data.error)

        tree = parseTreeResponse(data.result ?? '')

        // Store in cache for future identical images
        imageAnalysisCache.set(cacheKey, tree)
      },
    )

    // Step 3: Preview & confirm
    const previewLines = flattenTree(tree!, '')
    const cacheLabel = fromCache ? ' (from cache ⚡)' : ''
    const preview =
      previewLines.slice(0, 20).join('\n') +
      (previewLines.length > 20
        ? `\n... and ${previewLines.length - 20} more`
        : '')

    const confirm = await vscode.window.showInformationMessage(
      `VibeFiles detected ${previewLines.length} items${cacheLabel}:\n\n${preview}`,
      { modal: true },
      'Create Files',
      'Cancel',
    )
    if (confirm !== 'Create Files') return

    // Step 4: Generate with rollback on failure
    await runGeneration(
      targetPath,
      async () => {
        const result = await createStructure(targetPath, tree!)
        // If any errors, rollback all created files for clean state
        if (!result.success && result.errors.length > 0) {
          rollbackStructure(targetPath, tree!)
        }
        return result
      },
      `Image-based structure`,
      'image',
    )
  } catch (err) {
    telemetry.record({
      type: 'generation_failed',
      source: 'image',
      errorCode:
        err instanceof Error && err.message.includes('timed out')
          ? 'TIMEOUT'
          : err instanceof Error && err.message.includes('429')
            ? 'RATE_LIMITED'
            : 'API_ERROR',
      durationMs: 0,
      timestamp: Date.now(),
    })
    vscode.window.showErrorMessage(
      `VibeFiles Error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

// ─── Helper: flatten tree for preview ────────────────────────────────────────

function flattenTree(tree: TemplateTree, prefix: string): string[] {
  const lines: string[] = []
  for (const [name, entry] of Object.entries(tree)) {
    if (entry.type === 'folder') {
      lines.push(`${prefix}📁 ${name}/`)
      lines.push(...flattenTree(entry.children, prefix + '  '))
    } else {
      lines.push(`${prefix}📄 ${name}`)
    }
  }
  return lines
}
