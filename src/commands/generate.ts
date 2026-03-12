import * as vscode from 'vscode'
import { templates } from '../templates'
import { createStructure } from '../utils/fileSystem'

export async function generateProjectStructure(): Promise<void> {
  // ── Step 1: Pick Framework ────────────────────────────────
  const frameworkPick = await vscode.window.showQuickPick(
    templates.map((t) => ({
      label: t.label,
      description: t.description,
    })),
    {
      placeHolder: 'Select a framework',
      title: 'VibeFiles — Choose Framework',
    },
  )

  if (!frameworkPick) return

  const selectedTemplate = templates.find(
    (t) => t.label === frameworkPick.label,
  )!

  // ── Step 2: Pick Language ─────────────────────────────────
  const languagePick = await vscode.window.showQuickPick(
    selectedTemplate.languages.map((l) => ({ label: l })),
    {
      placeHolder: 'Select a language',
      title: 'VibeFiles — Choose Language',
    },
  )

  if (!languagePick) return

  // ── Step 3: Pick Target Folder ────────────────────────────
  const targetPath = await pickTargetFolder()
  if (!targetPath) return

  // ── Step 4: Generate Files ────────────────────────────────
  await runGeneration(
    targetPath,
    async () => {
      const tree = selectedTemplate.getTree(languagePick.label)
      await createStructure(targetPath, tree)
    },
    `${selectedTemplate.label} (${languagePick.label})`,
  )
}

export async function pickTargetFolder(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders

  if (workspaceFolders && workspaceFolders.length > 0) {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(folder-opened) Use current workspace',
          description: workspaceFolders[0].uri.fsPath,
          value: 'workspace',
        },
        {
          label: '$(folder) Choose a different folder',
          value: 'pick',
        },
      ],
      {
        placeHolder: 'Where should VibeFiles generate the structure?',
        title: 'VibeFiles — Target Folder',
      },
    )

    if (!choice) return undefined
    if ((choice as any).value === 'workspace') {
      return workspaceFolders[0].uri.fsPath
    }
  }

  const folderUri = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: 'Select Project Folder',
  })

  if (!folderUri || folderUri.length === 0) return undefined
  return folderUri[0].fsPath
}

export async function runGeneration(
  targetPath: string,
  task: () => Promise<void>,
  label: string,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `VibeFiles: Generating ${label}...`,
        cancellable: false,
      },
      async () => {
        await task()
      },
    )

    const action = await vscode.window.showInformationMessage(
      `✅ VibeFiles: ${label} structure created successfully!`,
      'Open Folder',
      'Dismiss',
    )

    if (action === 'Open Folder') {
      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(targetPath),
        false,
      )
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `VibeFiles Error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
