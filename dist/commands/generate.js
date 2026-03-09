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
exports.generateProjectStructure = generateProjectStructure;
const vscode = __importStar(require("vscode"));
const templates_1 = require("../templates");
const fileSystem_1 = require("../utils/fileSystem");
async function generateProjectStructure() {
    // ── Step 1: Pick Framework ────────────────────────────────
    const frameworkPick = await vscode.window.showQuickPick(templates_1.templates.map((t) => ({
        label: t.label,
        description: t.description,
    })), {
        placeHolder: 'Select a framework',
        title: 'VibeFiles — Choose Framework',
    });
    if (!frameworkPick) {
        return; // user cancelled
    }
    const selectedTemplate = templates_1.templates.find((t) => t.label === frameworkPick.label);
    // ── Step 2: Pick Language ─────────────────────────────────
    const languagePick = await vscode.window.showQuickPick(selectedTemplate.languages.map((l) => ({ label: l })), {
        placeHolder: 'Select a language',
        title: 'VibeFiles — Choose Language',
    });
    if (!languagePick) {
        return;
    }
    // ── Step 3: Pick Target Folder ────────────────────────────
    let targetPath;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        // Ask if they want to use current workspace or pick new folder
        const choice = await vscode.window.showQuickPick([
            {
                label: '$(folder-opened) Use current workspace',
                description: workspaceFolders[0].uri.fsPath,
                value: 'workspace',
            },
            {
                label: '$(folder) Choose a different folder',
                value: 'pick',
            },
        ], {
            placeHolder: 'Where should VibeFiles generate the structure?',
            title: 'VibeFiles — Target Folder',
        });
        if (!choice) {
            return;
        }
        if (choice.value === 'workspace') {
            targetPath = workspaceFolders[0].uri.fsPath;
        }
    }
    if (!targetPath) {
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Project Folder',
        });
        if (!folderUri || folderUri.length === 0) {
            return;
        }
        targetPath = folderUri[0].fsPath;
    }
    // ── Step 4: Generate Files ────────────────────────────────
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `VibeFiles: Generating ${selectedTemplate.label} (${languagePick.label})...`,
            cancellable: false,
        }, async () => {
            const tree = selectedTemplate.getTree(languagePick.label);
            await (0, fileSystem_1.createStructure)(targetPath, tree);
        });
        // ── Step 5: Success message + open folder ─────────────
        const action = await vscode.window.showInformationMessage(`✅ VibeFiles: ${selectedTemplate.label} structure created successfully!`, 'Open Folder', 'Dismiss');
        if (action === 'Open Folder') {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
        }
    }
    catch (err) {
        vscode.window.showErrorMessage(`VibeFiles Error: ${err instanceof Error ? err.message : String(err)}`);
    }
}
