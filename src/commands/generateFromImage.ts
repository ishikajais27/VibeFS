import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { TemplateTree } from '../templates'
import { createStructure } from '../utils/fileSystem'
import { pickTargetFolder, runGeneration } from './generate'

// ─── Your Vercel backend URL ──────────────────────────────────────────────────
const SERVER_URL = 'https://vibe-fs-server.vercel.app/api/analyze'

// ─── Call your backend (no API key needed by user) ───────────────────────────

async function analyzeImageViaServer(
  imageBase64: string,
  mediaType: string,
): Promise<TemplateTree> {
  const response = await fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Server error ${response.status}: ${errorBody}`)
  }

  const data = (await response.json()) as { result?: string; error?: string }

  if (data.error) {
    throw new Error(data.error)
  }

  const text = (data.result ?? '').trim()

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as TemplateTree
  } catch {
    throw new Error(
      `Failed to parse response as JSON.\n\nRaw response:\n${text.slice(0, 500)}`,
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
    filters: {
      Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    },
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

  // Step 3: Analyze + generate
  let tree: TemplateTree

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'VibeFiles: Analyzing image with AI...',
        cancellable: false,
      },
      async () => {
        const imageBuffer = fs.readFileSync(imagePath)
        const imageBase64 = imageBuffer.toString('base64')
        tree = await analyzeImageViaServer(imageBase64, mediaType)
      },
    )

    // Show preview
    const previewLines = flattenTree(tree!, '')
    const preview =
      previewLines.slice(0, 20).join('\n') +
      (previewLines.length > 20
        ? `\n... and ${previewLines.length - 20} more`
        : '')

    const confirm = await vscode.window.showInformationMessage(
      `VibeFiles detected ${previewLines.length} items:\n\n${preview}`,
      { modal: true },
      'Create Files',
      'Cancel',
    )

    if (confirm !== 'Create Files') return

    await runGeneration(
      targetPath,
      async () => {
        await createStructure(targetPath, tree!)
      },
      'Image-based structure',
    )
  } catch (err) {
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
