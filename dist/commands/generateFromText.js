"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFromText = generateFromText;
const vscode = __importStar(require("vscode"));
const fileSystem_1 = require("../utils/fileSystem");
const generate_1 = require("./generate");
// ─── Parse pasted folder structure text into TemplateTree ────────────────────
function parseTextStructure(text) {
    const lines = text
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => l.trim().length > 0);
    const root = {};
    function getDepthAndName(line) {
        const stripped = line.replace(/[│├└─\s]*/, '').trimEnd();
        const raw = line.replace(/[├└─│]/g, ' ');
        const indent = raw.match(/^(\s*)/)?.[1] ?? '';
        const depth = Math.round(indent.replace(/\t/g, '  ').length / 2);
        return { depth, name: stripped };
    }
    const stack = [
        { depth: -1, tree: root },
    ];
    for (const line of lines) {
        const { depth, name } = getDepthAndName(line);
        if (!name)
            continue;
        const isFolder = name.endsWith('/');
        const cleanName = isFolder ? name.slice(0, -1) : name;
        while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
            stack.pop();
        }
        const parentTree = stack[stack.length - 1].tree;
        if (isFolder) {
            const children = {};
            parentTree[cleanName] = { type: 'folder', children };
            stack.push({ depth, tree: children });
        }
        else {
            parentTree[cleanName] = { type: 'file', content: '' };
        }
    }
    return root;
}
// ─── Flatten tree for preview ─────────────────────────────────────────────────
function flattenTree(tree, prefix) {
    const lines = [];
    for (const [name, entry] of Object.entries(tree)) {
        if (entry.type === 'folder') {
            lines.push(`${prefix}📁 ${name}/`);
            lines.push(...flattenTree(entry.children, prefix + '  '));
        }
        else {
            lines.push(`${prefix}📄 ${name}`);
        }
    }
    return lines;
}
// ─── Show multiline webview input panel ──────────────────────────────────────
function showTextInputPanel(context) {
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel('vibefilesTextInput', 'VibeFiles — Paste Folder Structure', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = `<!DOCTYPE html>
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
    h2 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
    }
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
    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 14px;
    }
    button {
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
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
  <div class="actions">
    <button class="btn-primary" onclick="submit()">Generate Files</button>
    <button class="btn-secondary" onclick="cancel()">Cancel</button>
  </div>
  <div class="hint">💡 Tip: You can paste directly from ChatGPT, GitHub, or any terminal tree output.</div>
  <script>
    const vscode = acquireVsCodeApi();
    function submit() {
      const val = document.getElementById('input').value.trim();
      if (!val) { document.getElementById('input').focus(); return; }
      vscode.postMessage({ command: 'submit', text: val });
    }
    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }
    document.getElementById('input').addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.target;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = el.value.substring(0, start) + '  ' + el.value.substring(end);
        el.selectionStart = el.selectionEnd = start + 2;
      }
    });
  </script>
</body>
</html>`;
        let resolved = false;
        panel.webview.onDidReceiveMessage((msg) => {
            if (resolved)
                return;
            if (msg.command === 'submit') {
                resolved = true;
                panel.dispose();
                resolve(msg.text);
            }
            else if (msg.command === 'cancel') {
                resolved = true;
                panel.dispose();
                resolve(undefined);
            }
        });
        panel.onDidDispose(() => {
            if (!resolved) {
                resolved = true;
                resolve(undefined);
            }
        });
    });
}
// ─── Main command ─────────────────────────────────────────────────────────────
async function generateFromText(context) {
    // Step 1: Show multiline webview input
    const input = await showTextInputPanel(context);
    if (!input)
        return;
    // Step 2: Parse the text
    let tree;
    try {
        tree = parseTextStructure(input);
    }
    catch (err) {
        vscode.window.showErrorMessage(`VibeFiles: Could not parse structure — ${err instanceof Error ? err.message : String(err)}`);
        return;
    }
    const previewLines = flattenTree(tree, '');
    if (previewLines.length === 0) {
        vscode.window.showErrorMessage('VibeFiles: No files or folders detected in the pasted text.');
        return;
    }
    // Step 3: Show preview & confirm
    const preview = previewLines.slice(0, 20).join('\n') +
        (previewLines.length > 20
            ? `\n... and ${previewLines.length - 20} more`
            : '');
    const confirm = await vscode.window.showInformationMessage(`VibeFiles detected ${previewLines.length} items:\n\n${preview}`, { modal: true }, 'Create Files', 'Cancel');
    if (confirm !== 'Create Files')
        return;
    // Step 4: Pick target folder
    const targetPath = await (0, generate_1.pickTargetFolder)();
    if (!targetPath)
        return;
    // Step 5: Generate
    await (0, generate_1.runGeneration)(targetPath, async () => {
        await (0, fileSystem_1.createStructure)(targetPath, tree);
    }, 'Text-based structure');
}
