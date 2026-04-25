# VibeFiles ⚡

**VS Code extension that generates project folder structures instantly** — from framework templates, screenshots, or pasted tree text.

> 2,000+ installs · TypeScript · Groq Vision API · VS Code Extension API

---

## What It Does

Every developer spends 10–15 minutes recreating the same folder scaffolding before writing a single line of real code. VibeFiles eliminates that.

| Mode | Input | Output |
|------|-------|--------|
| **Template** | Pick framework + language | Full project scaffold with starter files |
| **Image** | Screenshot of any repo structure | Detected file tree → real files |
| **Text** | Paste any tree-style or indented text | Parsed structure → real files |

---

## Engineering Design

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  VS Code Extension (TypeScript)                 │
│                                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐ │
│  │ Template │  │   Image   │  │    Text      │ │
│  │ Generator│  │ Generator │  │  Generator   │ │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘ │
│       │              │               │          │
│  ┌────▼──────────────▼───────────────▼───────┐  │
│  │           Core Generation Pipeline        │  │
│  │  - Input validation + path traversal guard│  │
│  │  - LRU cache (image + text)               │  │
│  │  - Atomic file writes (tmp → rename)      │  │
│  │  - Rollback on partial failure            │  │
│  │  - Structured result reporting            │  │
│  └───────────────────────┬───────────────────┘  │
│                          │                       │
│  ┌───────────────────────▼───────────────────┐  │
│  │           Telemetry Layer                 │  │
│  │  - Ring buffer (O(1) event storage)       │  │
│  │  - P95 latency tracking                   │  │
│  │  - Cache hit rate                         │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │
         ▼ (Image mode only)
┌─────────────────────┐
│  Vercel Backend     │
│  - Groq Vision API  │
│  - Rate limiting    │
│  - 10 req/IP/day    │
└─────────────────────┘
```

### Key Design Decisions

#### 1. Atomic File Writes (Fault Tolerance)
Files are written to a `.vibefiles.tmp` file first, then renamed — an atomic operation on the same filesystem. This prevents partial writes from corrupting existing files if the process is killed mid-generation.

```typescript
// tmp → rename: atomic on same filesystem
function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.vibefiles.tmp`
  fs.writeFileSync(tmpPath, content, 'utf-8')
  fs.renameSync(tmpPath, filePath)  // atomic
}
```

#### 2. Rollback on Partial Failure (Idempotency)
If generation fails mid-way, all created files and empty folders are removed. Failed operations leave no side effects — the workspace is in the same state as before.

#### 3. LRU Cache with TTL (Performance)
A custom O(1) LRU cache using JavaScript's Map (insertion-order guaranteed) stores AI analysis results.

- **Image cache**: keyed by djb2 hash of base64 content, 1hr TTL, max 50 entries
- **Text cache**: keyed by hash of trimmed input, 30min TTL, max 100 entries
- **Effect**: same image → instant result, zero API calls

Cache eviction uses a two-pronged strategy: LRU eviction when at capacity + TTL expiry on access. A periodic background purge every 15 minutes clears expired entries to prevent memory bloat.

#### 4. Retry with Exponential Backoff + Jitter (Resilience)
All Groq API calls retry up to 3 times on transient failures (5xx, network errors, timeouts). Backoff formula: `min(base × 2^attempt + random_jitter, maxDelay)`.

Jitter prevents the thundering herd problem — multiple users retrying simultaneously after a server restart would cause a second surge without it.

**Not retried**: 4xx errors (client errors are deterministic — retrying won't help).

#### 5. Path Traversal Guard (Security)
User-provided file trees from images or text could contain `../../` sequences attempting to escape the target directory. Every path is resolved and asserted to remain within the base directory before any filesystem operation.

```typescript
function assertSafePath(basePath: string, targetPath: string): void {
  const resolved = path.resolve(targetPath)
  const base = path.resolve(basePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal detected`)
  }
}
```

#### 6. Structured Error Results (Observability)
Generation returns a `GenerationResult` object instead of throwing. This captures partial successes — e.g., 47 files created, 2 skipped (already exist), 1 error. The caller decides how to surface this.

```typescript
type GenerationResult = {
  success: boolean
  filesCreated: number
  foldersCreated: number
  skipped: string[]        // already-existing paths
  errors: Array<{ path: string; reason: string }>
  durationMs: number
}
```

#### 7. Telemetry with Ring Buffer
Session metrics are tracked in a bounded ring buffer (O(1) insert, bounded memory). Tracks P95 latency (not just average) — averages hide tail latency problems.

---

## Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|----------------|-------|
| Template generation (50 files) | ~15ms | Pure filesystem I/O |
| Text parse (100 lines) | <1ms | O(n) single pass |
| Image analysis (cache hit) | <1ms | LRU cache lookup |
| Image analysis (cache miss) | 800–2500ms | Groq Vision API + retry |
| File write (atomic) | ~0.2ms/file | tmp→rename overhead negligible |

---

## Text Parser — Algorithm

The text-to-tree parser runs in **O(n) time** and **O(d) space** where n = lines and d = max nesting depth.

```
Input:
├── src/
│   ├── components/
│   │   └── Button.tsx
│   └── App.tsx
└── package.json

Algorithm:
1. Normalize box-drawing chars to spaces (preserves column width)
2. Calculate depth from indentation (4 spaces/level for tree, 2 for plain)
3. Maintain an explicit stack of {depth, tree} pairs
4. For each line: pop stack until correct parent depth, insert node

Result: O(1) per line, no backtracking, no regex on full string
```

Handles: box-drawing chars, plain indent, tabs, mixed styles, inline comments, paths with spaces.

---

## Error Codes

| Code | Meaning | Retry? |
|------|---------|--------|
| `API_ERROR` | Non-retryable server error | No |
| `PARSE_ERROR` | AI response wasn't valid JSON | No |
| `FILE_SYSTEM_ERROR` | Disk write failed | No |
| `PATH_TRAVERSAL` | Malicious path detected | No |
| `TIMEOUT` | Request exceeded 30s | Yes (auto) |
| `RATE_LIMITED` | 429 from server | Yes (auto) |
| `USER_CANCELLED` | User dismissed dialog | No |

---

## Install

1. Open VS Code → Extensions (`Ctrl+Shift+X`)
2. Search **VibeFiles**
3. Click Install → VibeFiles icon appears in sidebar

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ishika-jaiswal.vibefiles) · [GitHub](https://github.com/ishika-jaiswal/vibefiles)

---

## What I'd Build Next

- **Usage analytics dashboard** — aggregate (privacy-preserving) install + generation metrics
- **Conflict resolution UI** — when files already exist, show a diff and let user choose merge strategy
- **Custom template registry** — users publish/share templates, backed by a CDN
- **Undo support** — VS Code workspace edit API supports transactional undo of multi-file creation