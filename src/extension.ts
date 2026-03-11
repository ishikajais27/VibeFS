// import * as vscode from 'vscode'
// import { generateProjectStructure } from './commands/generate'
// import { generateFromImage } from './commands/generateFromImage'

// // ─── Sidebar Webview Provider ─────────────────────────────────────────────────

// class VibeFilesSidebarProvider implements vscode.WebviewViewProvider {
//   constructor(private readonly context: vscode.ExtensionContext) {}

//   resolveWebviewView(webviewView: vscode.WebviewView) {
//     webviewView.webview.options = { enableScripts: true }

//     webviewView.webview.html = `<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8"/>
//   <style>
//     * { box-sizing: border-box; margin: 0; padding: 0; }
//     body {
//       font-family: var(--vscode-font-family);
//       color: var(--vscode-foreground);
//       background: var(--vscode-sideBar-background);
//       padding: 16px 12px;
//     }
//     h2 {
//       font-size: 13px;
//       font-weight: 600;
//       margin-bottom: 4px;
//       color: var(--vscode-foreground);
//     }
//     p {
//       font-size: 11px;
//       color: var(--vscode-descriptionForeground);
//       margin-bottom: 16px;
//       line-height: 1.5;
//     }
//     button {
//       display: flex;
//       align-items: center;
//       gap: 8px;
//       width: 100%;
//       padding: 10px 12px;
//       margin-bottom: 10px;
//       border: 1px solid var(--vscode-button-border, transparent);
//       border-radius: 4px;
//       cursor: pointer;
//       font-size: 12px;
//       font-weight: 500;
//       transition: opacity 0.15s;
//     }
//     button:hover { opacity: 0.85; }
//     .btn-primary {
//       background: var(--vscode-button-background);
//       color: var(--vscode-button-foreground);
//     }
//     .btn-secondary {
//       background: var(--vscode-button-secondaryBackground);
//       color: var(--vscode-button-secondaryForeground);
//     }
//     .emoji { font-size: 16px; }
//     .divider {
//       border: none;
//       border-top: 1px solid var(--vscode-widget-border, #444);
//       margin: 16px 0;
//     }
//     .tip {
//       font-size: 10px;
//       color: var(--vscode-descriptionForeground);
//       line-height: 1.6;
//       background: var(--vscode-textBlockQuote-background, rgba(255,255,255,0.05));
//       border-left: 2px solid var(--vscode-button-background);
//       padding: 8px 10px;
//       border-radius: 0 4px 4px 0;
//     }
//   </style>
// </head>
// <body>
//   <h2>VibeFiles ⚡</h2>
//   <p>Generate project files in seconds — from a template or a photo.</p>

//   <button class="btn-primary" onclick="send('generate')">
//     <span class="emoji">🗂️</span> Generate from Template
//   </button>

//   <button class="btn-secondary" onclick="send('image')">
//     <span class="emoji">📸</span> Generate from Image
//   </button>

//   <hr class="divider"/>

//   <div class="tip">
//     💡 <strong>Tip:</strong> You can also right-click any folder in the Explorer panel and pick a VibeFiles option from the menu.
//   </div>

//   <script>
//     const vscode = acquireVsCodeApi();
//     function send(cmd) { vscode.postMessage({ command: cmd }); }
//   </script>
// </body>
// </html>`

//     webviewView.webview.onDidReceiveMessage((msg) => {
//       if (msg.command === 'generate') {
//         vscode.commands.executeCommand('vibefiles.generate')
//       } else if (msg.command === 'image') {
//         vscode.commands.executeCommand('vibefiles.generateFromImage')
//       }
//     })
//   }
// }

// // ─── Activate ─────────────────────────────────────────────────────────────────

// export function activate(context: vscode.ExtensionContext) {
//   // Commands
//   context.subscriptions.push(
//     vscode.commands.registerCommand('vibefiles.generate', () =>
//       generateProjectStructure(),
//     ),
//     vscode.commands.registerCommand('vibefiles.generateFromImage', () =>
//       generateFromImage(context),
//     ),
//     vscode.commands.registerCommand('vibefiles.clearApiKey', async () => {
//       await context.secrets.delete('vibefiles.groqApiKey')
//       vscode.window.showInformationMessage('VibeFiles: API key cleared.')
//     }),
//   )

//   // Sidebar
//   context.subscriptions.push(
//     vscode.window.registerWebviewViewProvider(
//       'vibefiles.mainView',
//       new VibeFilesSidebarProvider(context),
//     ),
//   )
// }

// export function deactivate() {}
import * as vscode from 'vscode'
import { generateProjectStructure } from './commands/generate'
import { generateFromImage } from './commands/generateFromImage'
import { generateFromText } from './commands/generateFromText'

// ─── Sidebar Webview Provider ─────────────────────────────────────────────────

class VibeFilesSidebarProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = { enableScripts: true }

    webviewView.webview.html = `<!DOCTYPE html>
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
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
    }
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
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .emoji { font-size: 16px; }
    .divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, #444);
      margin: 16px 0;
    }
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
  <p>Generate project files in seconds — from a template or a photo.</p>

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

  <div class="tip">
    💡 <strong>Tip:</strong> You can also right-click any folder in the Explorer panel and pick a VibeFiles option from the menu.
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'generate') {
        vscode.commands.executeCommand('vibefiles.generate')
      } else if (msg.command === 'image') {
        vscode.commands.executeCommand('vibefiles.generateFromImage')
      } else if (msg.command === 'text') {
        vscode.commands.executeCommand('vibefiles.generateFromText')
      }
    })
  }
}

// ─── Activate ─────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Commands
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
    vscode.commands.registerCommand('vibefiles.clearApiKey', async () => {
      await context.secrets.delete('vibefiles.groqApiKey')
      vscode.window.showInformationMessage('VibeFiles: API key cleared.')
    }),
  )

  // Sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'vibefiles.mainView',
      new VibeFilesSidebarProvider(context),
    ),
  )
}

export function deactivate() {}
