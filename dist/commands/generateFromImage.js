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
exports.generateFromImage = generateFromImage;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileSystem_1 = require("../utils/fileSystem");
const generate_1 = require("./generate");
// ─── Your Vercel backend URL ──────────────────────────────────────────────────
const SERVER_URL = 'https://vibe-fs-server.vercel.app/api/analyze';
// ─── Call your backend (no API key needed by user) ───────────────────────────
async function analyzeImageViaServer(imageBase64, mediaType) {
    const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Server error ${response.status}: ${errorBody}`);
    }
    const data = (await response.json());
    if (data.error) {
        throw new Error(data.error);
    }
    const text = (data.result ?? '').trim();
    const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    try {
        return JSON.parse(cleaned);
    }
    catch {
        throw new Error(`Failed to parse response as JSON.\n\nRaw response:\n${text.slice(0, 500)}`);
    }
}
// ─── Main command ─────────────────────────────────────────────────────────────
async function generateFromImage(context) {
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
    });
    if (!imageUris || imageUris.length === 0)
        return;
    const imagePath = imageUris[0].fsPath;
    const ext = path.extname(imagePath).toLowerCase().replace('.', '');
    const mediaTypeMap = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
    };
    const mediaType = mediaTypeMap[ext];
    if (!mediaType) {
        vscode.window.showErrorMessage(`VibeFiles: Unsupported image type: ${ext}`);
        return;
    }
    // Step 2: Pick target folder
    const targetPath = await (0, generate_1.pickTargetFolder)();
    if (!targetPath)
        return;
    // Step 3: Analyze + generate
    let tree;
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'VibeFiles: Analyzing image with AI...',
            cancellable: false,
        }, async () => {
            const imageBuffer = fs.readFileSync(imagePath);
            const imageBase64 = imageBuffer.toString('base64');
            tree = await analyzeImageViaServer(imageBase64, mediaType);
        });
        // Show preview
        const previewLines = flattenTree(tree, '');
        const preview = previewLines.slice(0, 20).join('\n') +
            (previewLines.length > 20
                ? `\n... and ${previewLines.length - 20} more`
                : '');
        const confirm = await vscode.window.showInformationMessage(`VibeFiles detected ${previewLines.length} items:\n\n${preview}`, { modal: true }, 'Create Files', 'Cancel');
        if (confirm !== 'Create Files')
            return;
        await (0, generate_1.runGeneration)(targetPath, async () => {
            await (0, fileSystem_1.createStructure)(targetPath, tree);
        }, 'Image-based structure');
    }
    catch (err) {
        vscode.window.showErrorMessage(`VibeFiles Error: ${err instanceof Error ? err.message : String(err)}`);
    }
}
// ─── Helper: flatten tree for preview ────────────────────────────────────────
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
