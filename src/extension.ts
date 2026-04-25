import * as vscode from 'vscode'
import { generateProjectStructure } from './commands/generate'
import { generateFromImage } from './commands/generateFromImage'
import { generateFromText } from './commands/generateFromText'
import { telemetry, initStatusBar } from './telemetry/telemetry'
import { imageAnalysisCache, textParseCache } from './cache/lruCache'

// ─── Sidebar Webview Provider ─────────────────────────────────────────────────

class VibeFilesSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = buildSidebarHtml()

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'generate':
          vscode.commands.executeCommand('vibefiles.generate')
          break
        case 'image':
          vscode.commands.executeCommand('vibefiles.generateFromImage')
          break
        case 'text':
          vscode.commands.executeCommand('vibefiles.generateFromText')
          break
        case 'stats':
          vscode.commands.executeCommand('vibefiles.showStats')
          break
      }
    })
  }
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Core generation commands
  context.subscriptions.push(
    vscode.commands.registerCommand('vibefiles.generate', () =>
      generateProjectStructure(),
    ),
    vscode.commands.registerCommand('vibefiles.generateFromImage', () =>
      generateFromImage(context),
    ),
    vscode.commands.registerCommand('vibefiles.generateFromText', () =>
      generateFromText(context),
    ),
  )

  // ── Stats command ─────────────────────────────────────────
  // Shows session metrics in an output channel — operational visibility
  context.subscriptions.push(
    vscode.commands.registerCommand('vibefiles.showStats', () => {
      const channel = vscode.window.createOutputChannel('VibeFiles Stats')
      const m = telemetry.getMetrics()
      const imgCacheStats = imageAnalysisCache.stats
      const txtCacheStats = textParseCache.stats

      channel.appendLine(telemetry.formatSummary())
      channel.appendLine('')
      channel.appendLine('Cache Statistics')
      channel.appendLine('─────────────────────────')
      channel.appendLine(
        `Image cache : ${imgCacheStats.size}/${imgCacheStats.maxSize} entries | hit rate ${(imgCacheStats.hitRate * 100).toFixed(1)}% | evictions ${imgCacheStats.evictions}`,
      )
      channel.appendLine(
        `Text cache  : ${txtCacheStats.size}/${txtCacheStats.maxSize} entries | hit rate ${(txtCacheStats.hitRate * 100).toFixed(1)}% | evictions ${txtCacheStats.evictions}`,
      )
      channel.appendLine('')
      channel.appendLine('Recent Events (last 5)')
      channel.appendLine('─────────────────────────')
      for (const evt of telemetry.getRecentEvents(5)) {
        const time = new Date(evt.timestamp).toLocaleTimeString()
        channel.appendLine(`[${time}] ${evt.type}`)
      }
      channel.show()
    }),
  )

  // ── Cache clear command ───────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('vibefiles.clearCache', async () => {
      imageAnalysisCache.clear()
      textParseCache.clear()
      vscode.window.showInformationMessage('VibeFiles: Cache cleared.')
    }),
  )

  // ── API key management ────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('vibefiles.clearApiKey', async () => {
      await context.secrets.delete('vibefiles.groqApiKey')
      vscode.window.showInformationMessage('VibeFiles: API key cleared.')
    }),
  )

  // ── Sidebar ───────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'vibefiles.mainView',
      new VibeFilesSidebarProvider(context),
    ),
  )

  // ── Status bar ────────────────────────────────────────────
  initStatusBar(context)

  // ── Periodic cache purge (every 15 min) ──────────────────
  // Removes expired TTL entries to prevent memory bloat
  const purgeInterval = setInterval(
    () => {
      const imgPurged = imageAnalysisCache.purgeExpired()
      const txtPurged = textParseCache.purgeExpired()
      if (imgPurged + txtPurged > 0) {
        console.log(
          `[VibeFiles] Cache purge: removed ${imgPurged + txtPurged} expired entries`,
        )
      }
    },
    15 * 60 * 1000,
  )

  context.subscriptions.push({
    dispose: () => clearInterval(purgeInterval),
  })
}

export function deactivate() {}

// ─── Sidebar HTML ─────────────────────────────────────────────────────────────

function buildSidebarHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 16px 12px;
    }
    h2 { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    p {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 16px;
      line-height: 1.5;
    }
    button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-ghost {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border-color: var(--vscode-widget-border, #444);
      font-size: 11px;
      padding: 7px 12px;
    }
    .emoji { font-size: 16px; }
    .divider { border: none; border-top: 1px solid var(--vscode-widget-border, #444); margin: 16px 0; }
    .tip {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05));
      border-left: 2px solid var(--vscode-button-background);
      padding: 8px 10px;
      border-radius: 0 4px 4px 0;
    }
  </style>
</head>
<body>
  <h2>VibeFiles ⚡</h2>
  <p>Generate project files in seconds — from a template, image, or pasted structure.</p>

  <button class="btn-primary" onclick="send('generate')">
    <span class="emoji">🗂️</span> Generate from Template
  </button>
  <button class="btn-secondary" onclick="send('image')">
    <span class="emoji">📸</span> Generate from Image
  </button>
  <button class="btn-secondary" onclick="send('text')">
    <span class="emoji">📋</span> Generate from Text
  </button>

  <hr class="divider"/>

  <button class="btn-ghost" onclick="send('stats')">
    <span class="emoji">📊</span> View Session Stats
  </button>

  <hr class="divider"/>

  <div class="tip">
    💡 <strong>Tip:</strong> Right-click any folder in the Explorer for quick access. Image analysis is cached — same image = instant results.
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`
}
