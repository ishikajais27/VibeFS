import * as fs from 'fs'
import * as path from 'path'
import { TemplateTree } from '../templates'

// ─── Result type for structured error handling ────────────────────────────────

export type GenerationResult = {
  success: boolean
  filesCreated: number
  foldersCreated: number
  skipped: string[]
  errors: Array<{ path: string; reason: string }>
  durationMs: number
}

// ─── Atomic write with temp-file + rename ─────────────────────────────────────
// Prevents partial writes corrupting existing files.
// Strategy: write to .tmp → rename (atomic on same filesystem)

function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.vibefiles.tmp`
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch (err) {
    // Clean up temp file if rename fails
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw err
  }
}

// ─── Path traversal guard ─────────────────────────────────────────────────────
// Prevents malicious tree structures (e.g., "../../etc/passwd") from escaping
// the target directory. Key security check for user-provided inputs.

function assertSafePath(basePath: string, targetPath: string): void {
  const resolved = path.resolve(targetPath)
  const base = path.resolve(basePath)
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(
      `Path traversal detected: "${targetPath}" escapes base directory.`,
    )
  }
}

// ─── Validate filename ────────────────────────────────────────────────────────
// Rejects names with null bytes or path separators — catches injection attempts.

function isValidName(name: string): boolean {
  if (!name || name.trim().length === 0) return false
  if (name.includes('\0')) return false // null byte injection
  if (name.includes('/') || name.includes('\\')) return false // path sep
  if (name === '.' || name === '..') return false // directory traversal
  return true
}

// ─── Recursive structure creator ──────────────────────────────────────────────
// Returns a result object instead of throwing — caller decides how to handle.
// Tracks: files created, folders created, skipped (already exists), errors.

export async function createStructure(
  basePath: string,
  tree: TemplateTree,
  result: GenerationResult = {
    success: true,
    filesCreated: 0,
    foldersCreated: 0,
    skipped: [],
    errors: [],
    durationMs: 0,
  },
): Promise<GenerationResult> {
  for (const [name, entry] of Object.entries(tree)) {
    // Input validation
    if (!isValidName(name)) {
      result.errors.push({ path: name, reason: 'Invalid filename' })
      continue
    }

    const fullPath = path.join(basePath, name)

    // Security: block path traversal
    try {
      assertSafePath(basePath, fullPath)
    } catch (err) {
      result.errors.push({
        path: fullPath,
        reason: err instanceof Error ? err.message : 'Path traversal blocked',
      })
      result.success = false
      continue
    }

    if (entry.type === 'folder') {
      try {
        if (!fs.existsSync(fullPath)) {
          fs.mkdirSync(fullPath, { recursive: true })
          result.foldersCreated++
        }
        // Recurse into children
        await createStructure(fullPath, entry.children, result)
      } catch (err) {
        result.errors.push({
          path: fullPath,
          reason:
            err instanceof Error ? err.message : 'Failed to create folder',
        })
        result.success = false
      }
    } else {
      try {
        if (fs.existsSync(fullPath)) {
          result.skipped.push(fullPath)
          continue
        }
        // Ensure parent dir exists (handles edge cases in custom trees)
        const parentDir = path.dirname(fullPath)
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true })
        }
        atomicWriteFile(fullPath, entry.content)
        result.filesCreated++
      } catch (err) {
        result.errors.push({
          path: fullPath,
          reason: err instanceof Error ? err.message : 'Failed to write file',
        })
        result.success = false
      }
    }
  }
  return result
}

// ─── Rollback: remove all created files/folders on failure ───────────────────
// Called when generation fails mid-way. Cleans up partial state.
// Amazon principle: idempotency — failed ops should leave no side effects.

export function rollbackStructure(basePath: string, tree: TemplateTree): void {
  for (const [name, entry] of Object.entries(tree)) {
    if (!isValidName(name)) continue
    const fullPath = path.join(basePath, name)
    try {
      if (entry.type === 'folder') {
        rollbackStructure(fullPath, entry.children)
        if (fs.existsSync(fullPath)) {
          const contents = fs.readdirSync(fullPath)
          if (contents.length === 0) {
            fs.rmdirSync(fullPath)
          }
        }
      } else {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
        }
      }
    } catch {
      /* best effort */
    }
  }
}

// ─── Count total nodes in tree ────────────────────────────────────────────────

export function countNodes(tree: TemplateTree): number {
  let count = 0
  for (const entry of Object.values(tree)) {
    count++
    if (entry.type === 'folder') {
      count += countNodes(entry.children)
    }
  }
  return count
}
