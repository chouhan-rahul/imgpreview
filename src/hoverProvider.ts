import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PathResolver } from './resolver';
import { ImageInfoReader } from './imageInfo';
import { ConfigManager } from './config';
import { DocumentScanner } from './scanner';

/**
 * Provides rich image preview cards and metadata on hover
 */
export class ImageHoverProvider implements vscode.HoverProvider {
  constructor(private resolver: PathResolver) { }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const config = ConfigManager.getConfig();

    if (!config.enableHover) {
      return undefined;
    }

    // Scan the active line for image matches
    const lineMatches = DocumentScanner.scanDocument(
      document,
      config.supportedExtensions,
      config.enableRemoteImages
    ).filter((m) => m.line === position.line);

    // Find the specific match that the cursor is hovering over
    const hoveredMatch = lineMatches.find((m) => m.range.contains(position));
    if (!hoveredMatch) {
      return undefined;
    }

    if (token.isCancellationRequested) {
      return undefined;
    }

    // Resolve the image file URI
    const resolvedUri = await this.resolver.resolve(hoveredMatch, document, config.maxFileSizeMB);
    if (!resolvedUri) {
      return undefined;
    }

    if (token.isCancellationRequested) {
      return undefined;
    }

    // Extract metadata (dimensions, size, format)
    const info = await ImageInfoReader.getInfo(resolvedUri, hoveredMatch.rawPath);

    const md = new vscode.MarkdownString();
    md.supportHtml = true;
    md.isTrusted = true;

    const fileName = path.basename(info.uri.fsPath);

    // 1. Compact, bounded image preview (guarantees zero scrollbars & short vertical height)
    const MAX_PREVIEW_WIDTH = 180;
    const MAX_PREVIEW_HEIGHT = 90;

    let widthAttr = MAX_PREVIEW_WIDTH;
    let heightAttr = MAX_PREVIEW_HEIGHT;

    if (info.width && info.height && info.width > 0 && info.height > 0) {
      // Scale proportionally to fill the fixed preview box (small icons enlarge, large images shrink)
      const scale = Math.min(
        MAX_PREVIEW_WIDTH / info.width,
        MAX_PREVIEW_HEIGHT / info.height
      );
      widthAttr = Math.max(1, Math.round(info.width * scale));
      heightAttr = Math.max(1, Math.round(info.height * scale));
    }

    // VS Code's MarkdownString restricts file:/// SVGs due to webview CSP.
    // Converting SVG to an inline base64 Data URI guarantees instant, reliable rendering in hover tooltips.
    let imageSrc = info.uri.toString();
    if (info.format === 'SVG' || info.uri.fsPath.toLowerCase().endsWith('.svg')) {
      try {
        if (fs.existsSync(info.uri.fsPath)) {
          const svgContent = await fs.promises.readFile(info.uri.fsPath);
          imageSrc = `data:image/svg+xml;base64,${svgContent.toString('base64')}`;
        }
      } catch {
        // Fallback to original URI
      }
    }

    md.appendMarkdown(
      `<div align="center"><img src="${imageSrc}" width="${widthAttr}" height="${heightAttr}" style="max-width: ${MAX_PREVIEW_WIDTH}px; max-height: ${MAX_PREVIEW_HEIGHT}px; object-fit: contain; border-radius: 4px; display: block;" alt="${fileName}" /></div>\n\n`
    );
    md.appendMarkdown(`---\n\n`);

    // 2. Clear, structured metadata row
    const details: string[] = [];

    if (info.width && info.height) {
      details.push(`📐 **Dimensions:** \`${info.width} × ${info.height} px\``);
    }

    if (info.formattedSize) {
      details.push(`💾 **Size:** \`${info.formattedSize}\``);
    }

    if (info.format) {
      details.push(`🏷️ **Format:** \`${info.format}\``);
    }

    md.appendMarkdown(details.join(' &nbsp;•&nbsp; ') + '\n\n');

    // 3. Quick Actions
    const fileUriStr = encodeURIComponent(JSON.stringify([info.uri]));
    md.appendMarkdown(
      `[📁 Reveal in File Explorer](command:revealFileInOS?${fileUriStr}) &nbsp;•&nbsp; ` +
      `[📋 Copy as Data URI](command:imgPreview.copyDataUri?${fileUriStr})`
    );

    return new vscode.Hover(md, hoveredMatch.range);
  }
}

