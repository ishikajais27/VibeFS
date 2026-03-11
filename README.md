# ⚡ VibeFiles

Generate your project folder structure in seconds — from a template or a screenshot.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=vibefiles.vibefiles)

---

## What it does

Instead of manually creating folders and files one by one, VibeFiles does it all instantly.

- 🗂️ **Template Mode** — Pick a framework and get a full starter structure
- 📸 **Image Mode** — Upload a screenshot of any folder structure and VibeFiles recreates it using AI

No API key needed. No account. Completely free.

---

## Install

**From VS Code:**

1. Press `Ctrl + Shift + X`
2. Search `VibeFiles`
3. Click **Install**

**From the web:**

```
https://marketplace.visualstudio.com/items?itemName=vibefiles.vibefiles
```

---

## How to Use

You have 3 ways to open VibeFiles — no commands needed:

|     | Method          | How                                                 |
| --- | --------------- | --------------------------------------------------- |
| ⚡  | Sidebar         | Click the VibeFiles icon in the left activity bar   |
| 🖱️  | Right-click     | Right-click any folder in Explorer → pick VibeFiles |
| ⌨️  | Command Palette | `Ctrl+Shift+P` → type `VibeFiles`                   |

### 🗂️ Template Mode

1. Click **Generate from Template**
2. Pick a framework
3. Pick a language
4. Choose where to save
5. Done ✅

### 📸 Image Mode

1. Click **Generate from Image**
2. Pick a PNG or JPG showing a folder structure
3. Choose where to save
4. Review what AI detected → click **Create Files**
5. Done ✅

Works with screenshots, GitHub repo views, or even a photo of paper.

---

## Supported Frameworks

| Framework | Languages              |
| --------- | ---------------------- |
| React     | TypeScript, JavaScript |
| Next.js   | TypeScript, JavaScript |
| Express   | TypeScript, JavaScript |
| Node.js   | TypeScript, JavaScript |
| Flask     | Python                 |
| Django    | Python                 |

---

## How I Built It

**Stack:**

- TypeScript + VS Code Extension API
- Sidebar built as a `WebviewViewProvider` with custom HTML/CSS
- File creation uses Node.js `fs` (not `vscode.workspace.fs`) to avoid workspace conflicts
- Image AI powered by Groq (`llama-4-scout-17b`) via a Vercel serverless backend — users need zero setup
- Packaged with `esbuild` + `vsce`

**Project structure:**

```
src/
├── extension.ts              # Registers commands + sidebar
├── commands/
│   ├── generate.ts           # Template mode logic
│   └── generateFromImage.ts  # Image mode + Vercel API call
├── templates/
│   └── index.ts              # All framework templates
└── utils/
    └── fileSystem.ts         # Writes folders/files to disk
```

**Key decisions:**

- Backend proxy on Vercel so no user needs a Groq API key
- Rate limited to 10 requests/IP/day to protect the free quota
- Preview step before file creation so users can confirm what AI detected

---

## Troubleshooting

**Sidebar icon not showing** → Fully close and reopen VS Code

**Files not created** → Don't generate into the extension folder. Pick a fresh target folder

**Image not reading right** → Use a clear screenshot with readable text. Higher resolution works better

---

## License

MIT — free to use, share, and modify.

---

Built by [Ishika Jaiswal](https://github.com/ishikajais09876)
