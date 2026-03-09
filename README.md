# VibeFiles

> Generate project folder structures from **templates** or a **photo/screenshot** of any structure.

---

## Features

- 📁 **Template Mode** — Pick React, Next.js, Express, Flask, Django, or Node.js and get a full boilerplate instantly
- 📸 **Image Mode** — Snap a photo, screenshot a diagram, or draw your structure on paper — VibeFiles reads it with Claude AI and creates the folders/files for you
- 🔒 **Secure API key storage** — Your Anthropic key is stored in VS Code's built-in secrets vault
- ✅ **Preview before creating** — Image mode shows you exactly what will be created before writing any files

---

## Commands

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                             | What it does                                                      |
| ----------------------------------- | ----------------------------------------------------------------- |
| `VibeFiles: Generate from Template` | Pick a framework + language → files generated                     |
| `VibeFiles: Generate from Image 📸` | Upload a photo of a structure → Claude reads it → files generated |
| `VibeFiles: Clear Saved API Key`    | Remove your stored Anthropic API key                              |

---

## Supported Templates

| Framework | Languages              |
| --------- | ---------------------- |
| React     | TypeScript, JavaScript |
| Next.js   | TypeScript, JavaScript |
| Express   | TypeScript, JavaScript |
| Node.js   | TypeScript, JavaScript |
| Flask     | Python                 |
| Django    | Python                 |

---

## Image Mode Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. Run `VibeFiles: Generate from Image 📸`
3. Paste your key when prompted (saved securely, never asked again)
4. Pick your image (PNG, JPG, JPEG, GIF, WEBP)
5. Preview the detected structure → confirm → done ✅

Works with:

- VS Code Explorer screenshots
- Hand-drawn diagrams
- Architecture diagrams
- Any image showing folder/file trees

---

## Development Setup

```bash
npm install
npm run build
```

Press `F5` to open the Extension Development Host and test both commands.

```bash
npm run package   # creates .vsix file
```

---

## No subscriptions. Open source. Built for vibe coders. 🎵
