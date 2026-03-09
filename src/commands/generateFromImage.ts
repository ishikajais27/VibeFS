import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { TemplateTree } from '../templates'
import { createStructure } from '../utils/fileSystem'
import { pickTargetFolder, runGeneration } from './generate'

// ─── Groq Vision API call ─────────────────────────────────────────────────────

async function analyzeImageWithGroq(
  imageBase64: string,
  mediaType: string,
  apiKey: string,
): Promise<TemplateTree> {
  const prompt = `You are a file system parser. The user has given you a screenshot or photo of a project folder/file structure (like a VS Code explorer tree, a diagram, or handwritten notes).

Your job is to extract that structure and return it as a STRICT JSON object.

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- Use this exact schema:
  {
    "folderName": { "type": "folder", "children": { ... } },
    "fileName.ext": { "type": "file", "content": "" }
  }
- Files should have empty "content": ""
- Folders must have "type": "folder" and a "children" object.
- Reproduce the structure exactly as shown in the image.
- Return ONLY the JSON object, nothing else.`

  const response = await fetch(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${imageBase64}`,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errorBody}`)
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? ''

  // Strip markdown fences if model adds them
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned) as TemplateTree
  } catch {
    throw new Error(
      `Failed to parse Groq response as JSON.\n\nRaw response:\n${text.slice(0, 500)}`,
    )
  }
}

// ─── Get or prompt for API key ────────────────────────────────────────────────

async function getApiKey(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const stored = await context.secrets.get('vibefiles.groqApiKey')
  if (stored) return stored

  const key = await vscode.window.showInputBox({
    title: 'VibeFiles — Groq API Key',
    prompt: 'Enter your free Groq API key (get one at console.groq.com)',
    placeHolder: 'gsk_...',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v.length > 10 ? null : 'Enter a valid Groq API key'),
  })

  if (!key) return undefined

  await context.secrets.store('vibefiles.groqApiKey', key)
  vscode.window.showInformationMessage(
    '✅ VibeFiles: Groq API key saved securely.',
  )
  return key
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function generateFromImage(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Step 1: Get API key
  const apiKey = await getApiKey(context)
  if (!apiKey) return

  // Step 2: Pick image file
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

  // Step 3: Pick target folder
  const targetPath = await pickTargetFolder()
  if (!targetPath) return

  // Step 4: Analyze + generate
  let tree: TemplateTree

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'VibeFiles: Analyzing image with Groq AI...',
        cancellable: false,
      },
      async () => {
        const imageBuffer = fs.readFileSync(imagePath)
        const imageBase64 = imageBuffer.toString('base64')
        tree = await analyzeImageWithGroq(imageBase64, mediaType, apiKey)
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
