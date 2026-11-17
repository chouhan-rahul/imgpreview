import * as vscode from 'vscode';
import { PathResolver } from './resolver';
import { ConfigManager } from './config';

/**
 * Manages gutter icon decorations across active editors.
 * Employs a pooled decoration cache and debouncing for ultra-low CPU/memory usage.
 */
export class GutterManager {
  /** Cache of decoration types keyed by image URI string to prevent recreating identical types */
  private decorationPool = new Map<string, vscode.TextEditorDecorationType>();

  /** Map of active decoration types applied per editor (keyed by document URI) */
  private activeEditorDecorations = new Map<string, Set<vscode.TextEditorDecorationType>>();

  /** Debounce timer for editor updates */
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(private resolver: PathResolver) {}

  /**
   * Schedules a debounced gutter decoration update for an editor
   */
  public triggerUpdate(editor: vscode.TextEditor | undefined, delayMs: number): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!editor || !editor.document) {
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.updateDecorations(editor);
    }, delayMs);
  }

  /**
   * Immediately updates gutter decorations for the specified editor
   */
  public async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const config = ConfigManager.getConfig();
    const docUriStr = editor.document.uri.toString();

    // If gutter preview is turned off in settings, clear everything for this editor
    if (!config.enableGutter) {
      this.clearEditorDecorations(editor);
      return;
    }

    // Dynamic import to prevent circular dependency
    const { DocumentScanner } = await import('./scanner');

    // Scan the document for all image matches
    const matches = DocumentScanner.scanDocument(
      editor.document,
      config.supportedExtensions,
      config.enableRemoteImages
    );

    // Group image ranges by resolved URI so multiple lines sharing the same image use 1 decoration
    const uriToRanges = new Map<string, { uri: vscode.Uri; ranges: vscode.Range[] }>();

    for (const match of matches) {
      try {
        const resolvedUri = await this.resolver.resolve(match, editor.document, config.maxFileSizeMB);
        if (!resolvedUri) continue;

        const key = resolvedUri.toString();
        const existing = uriToRanges.get(key);

        if (existing) {
          existing.ranges.push(match.range);
        } else {
          uriToRanges.set(key, { uri: resolvedUri, ranges: [match.range] });
        }
      } catch {
        // Skip unresolvable matches quietly
      }
    }

    // Track which decoration types are active in this update round
    const currentEditorTypes = new Set<vscode.TextEditorDecorationType>();

    for (const [key, item] of uriToRanges.entries()) {
      let decorationType = this.decorationPool.get(key);

      if (!decorationType) {
        // Create new decoration type with native contain scaling
        decorationType = vscode.window.createTextEditorDecorationType({
          gutterIconPath: item.uri,
          gutterIconSize: config.gutterIconSize,
        });
        this.decorationPool.set(key, decorationType);
      }

      currentEditorTypes.add(decorationType);
      editor.setDecorations(decorationType, item.ranges);
    }

    // Clean up stale decorations that were previously on this editor but are no longer present
    const prevTypes = this.activeEditorDecorations.get(docUriStr);
    if (prevTypes) {
      for (const oldType of prevTypes) {
        if (!currentEditorTypes.has(oldType)) {
          editor.setDecorations(oldType, []);
        }
      }
    }

    this.activeEditorDecorations.set(docUriStr, currentEditorTypes);
  }

  /**
   * Clears decorations for a specific editor
   */
  public clearEditorDecorations(editor: vscode.TextEditor): void {
    const docUriStr = editor.document.uri.toString();
    const activeTypes = this.activeEditorDecorations.get(docUriStr);

    if (activeTypes) {
      for (const decType of activeTypes) {
        editor.setDecorations(decType, []);
      }
      this.activeEditorDecorations.delete(docUriStr);
    }
  }

  /**
   * Clears decorations for all visible editors (e.g. when toggling gutter off)
   */
  public clearAllDecorations(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.clearEditorDecorations(editor);
    }
  }

  /**
   * Disposes all created decoration types to free memory on deactivation
   */
  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const decType of this.decorationPool.values()) {
      decType.dispose();
    }
    this.decorationPool.clear();
    this.activeEditorDecorations.clear();
  }
}

