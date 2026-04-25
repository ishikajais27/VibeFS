import * as vscode from 'vscode'
import { TemplateTree } from '../templates'
import { createStructure, rollbackStructure } from '../utils/fileSystem'
import { pickTargetFolder, runGeneration } from './generate'
import { textParseCache, hashString } from '../cache/lruCache'
import { telemetry } from '../telemetry/telemetry'

// ─── Input size guard ─────────────────────────────────────────────────────────
// Prevent processing arbitrarily large inputs — a basic DoS protection.
// Beyond 100KB, parsing time and memory cost are not worth it for a file tree.

const MAX_INPUT_BYTES = 100_000 // 100 KB

// ─── Parse pasted folder structure text into TemplateTree ────────────────────
// Supports:
//   1. Plain indented (2 spaces per level)
//   2. Tree-style box-drawing chars (├── └── │)
//   3. Inline comments (# ...)
//   4. Mixed indentation (tabs or spaces)
//
// Algorithm: single-pass with an explicit depth stack.
// Time: O(n) where n = number of lines. Space: O(d) where d = max depth.

export function parseTextStructure(text: string): TemplateTree {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0)

  const root: TemplateTree = {}

  function getDepthAndName(line: string): { depth: number; name: string } {
    const normalised = line
      .replace(/[│]/g, ' ')
      .replace(/[├└]──\s?/g, '    ')
      .replace(/[─]/g, ' ')

    const indent = normalised.match(/^( *)/)?.[1] ?? ''
    const hasBoxChars = /[│├└─]/.test(line)
    // Normalize tabs to 2 spaces before depth calculation
    const spacedIndent = indent.replace(/\t/g, '  ')
    const depth = hasBoxChars
      ? Math.floor(spacedIndent.length / 4)
      : Math.floor(spacedIndent.length / 2)

    let name = line
      .replace(/^[\s│├└─]+/, '')
      .split('#')[0]
      .trim()

    return { depth, name }
  }

  const stack: Array<{ depth: number; tree: TemplateTree }> = [
    { depth: -1, tree: root },
  ]

  for (const line of lines) {
    const { depth, name } = getDepthAndName(line)
    if (!name || name.startsWith('#')) continue

    const isFolder = name.endsWith('/')
    const cleanName = isFolder ? name.slice(0, -1) : name

    // Pop stack until we find the correct parent depth
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    const parentTree = stack[stack.length - 1].tree

    if (isFolder) {
      const children: TemplateTree = {}
      parentTree[cleanName] = { type: 'folder', children }
      stack.push({ depth, tree: children })
    } else {
      parentTree[cleanName] = { type: 'file', content: '' }
    }
  }

  return root
}

// ─── Flatten tree for preview ─────────────────────────────────────────────────

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

// ─── Webview input panel ──────────────────────────────────────────────────────

function showTextInputPanel(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      'vibefilesTextInput',
      'VibeFiles — Paste Folder Structure',
      vscode.ViewColumn.One,
      { enableScripts: true },
    )

    panel.webview.html = buildWebviewHtml()
    let resolved = false

    panel.webview.onDidReceiveMessage((msg) => {
      if (resolved) return
      if (msg.command === 'submit') {
        resolved = true
        panel.dispose()
        resolve(msg.text)
      } else if (msg.command === 'cancel') {
        resolved = true
        panel.dispose()
        resolve(undefined)
      }
    })

    panel.onDidDispose(() => {
      if (!resolved) {
        resolved = true
        resolve(undefined)
      }
    })
  })
}

function buildWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      padding: 24px;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    h2 { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      line-height: 1.6;
    }
    textarea {
      flex: 1;
      width: 100%;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      padding: 12px;
      resize: none;
      outline: none;
      line-height: 1.6;
      tab-size: 2;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    .char-count {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: right;
      margin-top: 4px;
    }
    .char-count.warn { color: #f0a500; }
    .actions { display: flex; gap: 10px; margin-top: 14px; }
    button {
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 10px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <h2>📝 Paste your folder structure</h2>
  <p>Use trailing <code>/</code> for folders and indentation for nesting. Supports plain indent and tree-style (├──) formats.</p>
  <textarea id="input" spellcheck="false" placeholder="stone-paper-scissor-game/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── css/
│   │   ├── reset.css
│   │   └── style.css
│   └── js/
│       └── main.js
└── package.json"></textarea>
  <div class="char-count" id="charCount">0 chars</div>
  <div class="actions">
    <button class="btn-primary" onclick="submit()">Generate Files</button>
    <button class="btn-secondary" onclick="cancel()">Cancel</button>
  </div>
  <div class="hint">💡 Tip: Paste directly from ChatGPT, GitHub, or any terminal tree output. Max 100KB.</div>
  <script>
    const vscode = acquireVsCodeApi();
    const MAX_BYTES = 100000;
    const input = document.getElementById('input');
    const charCount = document.getElementById('charCount');

    input.addEventListener('input', () => {
      const len = input.value.length;
      charCount.textContent = len.toLocaleString() + ' chars';
      charCount.classList.toggle('warn', len > MAX_BYTES * 0.8);
    });

    function submit() {
      const val = input.value.trim();
      if (!val) { input.focus(); return; }
      if (val.length > MAX_BYTES) {
        alert('Input too large (max 100KB). Please reduce the structure size.');
        return;
      }
      vscode.postMessage({ command: 'submit', text: val });
    }
    function cancel() { vscode.postMessage({ command: 'cancel' }); }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + '  ' + input.value.substring(end);
        input.selectionStart = input.selectionEnd = start + 2;
      }
    });
  </script>
</body>
</html>`
}

// ─── Main command ─────────────────────────────────────────────────────────────

export async function generateFromText(
  context: vscode.ExtensionContext,
): Promise<void> {
  const input = await showTextInputPanel(context)
  if (!input) return

  // Input size guard
  if (input.length > MAX_INPUT_BYTES) {
    vscode.window.showErrorMessage(
      `VibeFiles: Input too large (${input.length} chars). Max is ${MAX_INPUT_BYTES} chars.`,
    )
    return
  }

  // Cache lookup — same input text = same tree
  const cacheKey = hashString(input.trim())
  let tree: TemplateTree
  let fromCache = false

  const cached = textParseCache.get(cacheKey)
  if (cached) {
    tree = cached
    fromCache = true
    telemetry.record({
      type: 'cache_hit',
      source: 'text',
      timestamp: Date.now(),
    })
  } else {
    try {
      tree = parseTextStructure(input)
      textParseCache.set(cacheKey, tree)
    } catch (err) {
      telemetry.record({
        type: 'generation_failed',
        source: 'text',
        errorCode: 'PARSE_ERROR',
        durationMs: 0,
        timestamp: Date.now(),
      })
      vscode.window.showErrorMessage(
        `VibeFiles: Could not parse structure — ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
  }

  const previewLines = flattenTree(tree, '')
  if (previewLines.length === 0) {
    vscode.window.showErrorMessage(
      'VibeFiles: No files or folders detected in the pasted text.',
    )
    return
  }

  const cacheLabel = fromCache ? ' ⚡ (from cache)' : ''
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

  const targetPath = await pickTargetFolder()
  if (!targetPath) return

  await runGeneration(
    targetPath,
    async () => {
      const result = await createStructure(targetPath, tree)
      if (!result.success && result.errors.length > 0) {
        rollbackStructure(targetPath, tree)
      }
      return result
    },
    'Text-based structure',
    'text',
  )
}
