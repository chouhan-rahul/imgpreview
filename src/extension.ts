import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CacheManager } from './cacheManager';
import { PathResolver } from './resolver';
import { GutterManager } from './gutterManager';
import { ImageHoverProvider } from './hoverProvider';
import { ConfigManager } from './config';
import { DocumentScanner } from './scanner';

let gutterManager: GutterManager | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Updates the status bar item with the number of images detected in the active document
 */
function updateStatusBar(document: vscode.TextDocument | undefined): void {
  if (!statusBarItem) return;

  if (!document || document.isClosed) {
    statusBarItem.hide();
    return;
  }

  const config = ConfigManager.getConfig();
  const matches = DocumentScanner.scanDocument(
    document,
    config.supportedExtensions,
    config.enableRemoteImages
  );

  if (matches.length > 0) {
    statusBarItem.text = `$(file-media) ${matches.length} ${matches.length === 1 ? 'image' : 'images'}`;
    statusBarItem.tooltip = `Img Preview: Found ${matches.length} image reference(s). Click to toggle gutter preview.`;
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

/**
 * Extension entry point invoked when VS Code activates the extension
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Img Preview extension is now active!');

  // Initialize modular services
  const cacheManager = new CacheManager(context);
  const resolver = new PathResolver(cacheManager);
  gutterManager = new GutterManager(resolver);
  const hoverProvider = new ImageHoverProvider(resolver);

  // Status Bar Item (Shows image count & provides 1-click toggle)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'imgPreview.toggleGutter';
  context.subscriptions.push(statusBarItem);

  // 1. Register Hover Provider for all file documents
  const hoverRegistration = vscode.languages.registerHoverProvider(
    [
      { scheme: 'file' },
      { scheme: 'untitled' }
    ],
    hoverProvider
  );
  context.subscriptions.push(hoverRegistration);

  // 2. Register Commands
  const toggleGutterCommand = vscode.commands.registerCommand('imgPreview.toggleGutter', async () => {
    const newState = await ConfigManager.toggleGutter();
    if (gutterManager) {
      if (newState) {
        vscode.window.visibleTextEditors.forEach((editor) => {
          gutterManager?.triggerUpdate(editor, 0);
        });
        vscode.window.showInformationMessage('Img Preview: Gutter previews enabled.');
      } else {
        gutterManager.clearAllDecorations();
        vscode.window.showInformationMessage('Img Preview: Gutter previews disabled.');
      }
    }
  });

  const clearCacheCommand = vscode.commands.registerCommand('imgPreview.clearCache', async () => {
    await cacheManager.clearCache();
  });

  const copyDataUriCommand = vscode.commands.registerCommand(
    'imgPreview.copyDataUri',
    async (targetUri?: vscode.Uri) => {
      try {
        let uri = targetUri;
        if (!uri && vscode.window.activeTextEditor) {
          const editor = vscode.window.activeTextEditor;
          const pos = editor.selection.active;
          const config = ConfigManager.getConfig();
          const matches = DocumentScanner.scanDocument(
            editor.document,
            config.supportedExtensions,
            config.enableRemoteImages
          ).filter((m) => m.line === pos.line);
          const current = matches.find((m) => m.range.contains(pos)) || matches[0];
          if (current) {
            uri = await resolver.resolve(current, editor.document, config.maxFileSizeMB);
          }
        }

        if (!uri) {
          vscode.window.showWarningMessage('Img Preview: No image found to copy as Data URI.');
          return;
        }

        const fsPath = uri.fsPath;
        if (!fs.existsSync(fsPath)) {
          vscode.window.showErrorMessage('Img Preview: Image file does not exist.');
          return;
        }

        const ext = path.extname(fsPath).replace('.', '').toLowerCase();
        const buffer = await fs.promises.readFile(fsPath);
        const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const base64 = buffer.toString('base64');
        const dataUri = `data:${mime};base64,${base64}`;

        await vscode.env.clipboard.writeText(dataUri);
        vscode.window.showInformationMessage(`Img Preview: Copied "${path.basename(fsPath)}" as Data URI to clipboard!`);
      } catch (err) {
        vscode.window.showErrorMessage(`Img Preview: Failed to copy Data URI: ${err}`);
      }
    }
  );

  context.subscriptions.push(toggleGutterCommand, clearCacheCommand, copyDataUriCommand);

  // 3. Register Event Listeners for Gutter Updates & Status Bar
  // When active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && gutterManager) {
        gutterManager.triggerUpdate(editor, 50);
        updateStatusBar(editor.document);
      } else {
        statusBarItem?.hide();
      }
    })
  );

  // When text in document changes (typing, deleting, pasting)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!gutterManager) return;

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document === event.document) {
        const config = ConfigManager.getConfig();
        gutterManager.triggerUpdate(activeEditor, config.debounceDelay);
        updateStatusBar(activeEditor.document);
      }
    })
  );

  // When visible editors change (e.g. split editor view opened)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      if (!gutterManager) return;
      editors.forEach((editor) => {
        gutterManager?.triggerUpdate(editor, 50);
      });
      if (vscode.window.activeTextEditor) {
        updateStatusBar(vscode.window.activeTextEditor.document);
      }
    })
  );

  // When user changes extension settings
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('imgPreview')) {
        const config = ConfigManager.getConfig();
        if (gutterManager) {
          if (!config.enableGutter) {
            gutterManager.clearAllDecorations();
          } else {
            vscode.window.visibleTextEditors.forEach((editor) => {
              gutterManager?.triggerUpdate(editor, 0);
            });
          }
        }
        if (vscode.window.activeTextEditor) {
          updateStatusBar(vscode.window.activeTextEditor.document);
        }
      }
    })
  );

  // 4. Initial scan for currently open visible editors
  const initialConfig = ConfigManager.getConfig();
  if (initialConfig.enableGutter) {
    vscode.window.visibleTextEditors.forEach((editor) => {
      gutterManager?.triggerUpdate(editor, 100);
    });
  }
  if (vscode.window.activeTextEditor) {
    updateStatusBar(vscode.window.activeTextEditor.document);
  }
}

/**
 * Cleanup when extension is deactivated
 */
export function deactivate(): void {
  if (gutterManager) {
    gutterManager.dispose();
    gutterManager = undefined;
  }
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}

