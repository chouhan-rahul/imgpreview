import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ImageMatch } from './types';
import { CacheManager } from './cacheManager';

/**
 * Resolves raw image path strings into real local file URIs
 * Supports relative paths, workspace root, public/static dirs, Vite/Webpack `@/` aliases, remote URLs, and Data URIs.
 */
export class PathResolver {
  constructor(private cacheManager: CacheManager) {}

  /**
   * Resolves an ImageMatch into a local file Uri if it exists and is accessible
   */
  public async resolve(
    match: ImageMatch,
    document: vscode.TextDocument,
    maxFileSizeMB: number
  ): Promise<vscode.Uri | undefined> {
    const maxSizeBytes = maxFileSizeMB * 1024 * 1024;

    // 1. Data URIs
    if (match.type === 'data-uri') {
      return this.cacheManager.getDataUriFile(match.rawPath);
    }

    // 2. Remote URLs
    if (match.type === 'remote') {
      return this.cacheManager.getRemoteImageUri(match.rawPath, maxSizeBytes);
    }

    // 3. Local File System Paths
    return this.resolveLocalPath(match.rawPath, document);
  }

  /**
   * Resolves a local path using multiple strategies (relative, workspace root, public folder, aliases)
   */
  private resolveLocalPath(rawPath: string, document: vscode.TextDocument): vscode.Uri | undefined {
    // Strip query params and URL hash (e.g. "image.png?v=123#preview" -> "image.png")
    let cleanPath = rawPath.split('?')[0].split('#')[0].trim();

    // Decode URL-encoded characters (e.g. "my%20image.png" -> "my image.png")
    try {
      cleanPath = decodeURIComponent(cleanPath);
    } catch {
      // Keep as-is if decoding fails
    }

    // If path is absolute on OS (e.g., C:\... or /usr/...)
    if (path.isAbsolute(cleanPath) && fs.existsSync(cleanPath)) {
      return vscode.Uri.file(cleanPath);
    }

    const docDir = path.dirname(document.uri.fsPath);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const rootPath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;

    // Strategy A: Relative to current document directory
    const docRelative = path.resolve(docDir, cleanPath);
    if (fs.existsSync(docRelative) && !this.isDirectory(docRelative)) {
      return vscode.Uri.file(docRelative);
    }

    if (rootPath) {
      // Strategy B: Root-relative path (e.g., "/images/logo.png" or "images/logo.png")
      const rootRelative = path.resolve(rootPath, cleanPath.replace(/^[/\\]+/, ''));
      if (fs.existsSync(rootRelative) && !this.isDirectory(rootRelative)) {
        return vscode.Uri.file(rootRelative);
      }

      // Strategy C: Common web frameworks public / static folder (Vite, Next.js, Vue, Nuxt, Astro)
      // e.g. path in code: "/logo.svg" -> actual file: "<workspaceRoot>/public/logo.svg"
      const publicRelative = path.resolve(rootPath, 'public', cleanPath.replace(/^[/\\]+/, ''));
      if (fs.existsSync(publicRelative) && !this.isDirectory(publicRelative)) {
        return vscode.Uri.file(publicRelative);
      }

      const staticRelative = path.resolve(rootPath, 'static', cleanPath.replace(/^[/\\]+/, ''));
      if (fs.existsSync(staticRelative) && !this.isDirectory(staticRelative)) {
        return vscode.Uri.file(staticRelative);
      }

      // Strategy D: Webpack / Vite / Next.js `@/` or `~/` alias support
      if (cleanPath.startsWith('@/') || cleanPath.startsWith('~/')) {
        const withoutAlias = cleanPath.slice(2);

        // Try root/src/<path>
        const srcAlias = path.resolve(rootPath, 'src', withoutAlias);
        if (fs.existsSync(srcAlias) && !this.isDirectory(srcAlias)) {
          return vscode.Uri.file(srcAlias);
        }

        // Try root/<path>
        const directAlias = path.resolve(rootPath, withoutAlias);
        if (fs.existsSync(directAlias) && !this.isDirectory(directAlias)) {
          return vscode.Uri.file(directAlias);
        }
      }
    }

    return undefined;
  }

  private isDirectory(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isDirectory();
    } catch {
      return false;
    }
  }
}

