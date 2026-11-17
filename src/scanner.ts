import * as vscode from 'vscode';
import { ImageMatch, ImageSourceType } from './types';

/**
 * High-performance document scanner that identifies image references,
 * remote URLs, and data URIs across all programming languages and file types.
 */
export class DocumentScanner {
  /**
   * Scans a text document and returns all found image references with their exact ranges
   */
  public static scanDocument(
    document: vscode.TextDocument,
    supportedExtensions: string[],
    enableRemote: boolean
  ): ImageMatch[] {
    const matches: ImageMatch[] = [];
    const extPattern = supportedExtensions.map((e) => e.replace('.', '')).join('|');

    // Regex 1: Quoted paths with known image extension or format (e.g. "./img.png", 'img.webp', `.../png`)
    const quotedRegex = new RegExp(
      `(['"\`])([^'"\`\\r\\n]+?[\\./](?:${extPattern})(?:\\?[^'"\`\\s\\)]*)?)\\1`,
      'gi'
    );

    // Regex 2: CSS url(...) with or without quotes
    const cssUrlRegex = new RegExp(
      `url\\(\\s*(['"]?)([^'"\`\\)]+?)\\1\\s*\\)`,
      'gi'
    );

    // Regex 3: Markdown image syntax ![alt](path/to/image.png) or ![alt](https://...)
    const markdownRegex = new RegExp(
      `!\\[[^\\]]*\\]\\(\\s*(['"]?)([^'"\`\\s\\)]+)\\1[^\\)]*\\)`,
      'gi'
    );

    // Regex 4: src="..." attribute on single or multi-line tags (HTML, JSX, Svelte, Vue)
    const srcAttrRegex = new RegExp(
      `\\bsrc=(["'])(data:image\\/[^'"]+|https?:\\/\\/[^'"]+|[^'"\\r\\n]+?[\\./](?:${extPattern})(?:\\?[^'"\\s\\)]*)?)\\1`,
      'gi'
    );

    // Regex 5: Quoted Data URIs (data:image/...)
    const quotedDataUriRegex = /(['"`])(data:image\/[a-zA-Z0-9\+\-\.]+;?[a-zA-Z0-9=\+\-;]*,[\s\S]*?)\1/gi;

    // Regex 6: Unquoted base64 Data URIs
    const bareDataUriRegex = /data:image\/[a-zA-Z0-9\+\-\.]+;?[a-zA-Z0-9=\+\-;]*,[a-zA-Z0-9+/=_%#\.\-]+/gi;

    // Regex 7: Bare Remote URLs ending with an image extension or containing image formats
    const remoteUrlRegex = new RegExp(
      `https?:\\/\\/[^\\s'"\`\\)<>]+[\\./](?:${extPattern})(?:\\?[^\\s'"\`\\)<>]*)?`,
      'gi'
    );

    // Regex 8: Known image CDNs & placeholder generators (e.g. unsplash, picsum, placehold)
    const knownImageCdnRegex = /https?:\/\/(?:images\.unsplash\.com|picsum\.photos|placehold\.co|via\.placeholder\.com|placekitten\.com|dummyimage\.com|images\.pexels\.com|cdn\.pixabay\.com)\/[^\s'"\`\)<>]+/gi;

    // Regex 9: Remote image services with query-based formatting (e.g. ?auto=format, ?fm=webp, ?format=png)
    const remoteQueryImgRegex = /https?:\/\/[^\s'"\`\)<>]+\?(?:[^\s'"\`\)<>]*&(?:amp;)?)?(?:auto=format|(?:format|fm|ext)=(?:jpg|jpeg|png|webp|avif|svg))[^\s'"\`\)<>]*/gi;

    const lineCount = document.lineCount;

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
      const line = document.lineAt(lineIndex);
      const text = line.text;

      // Fast line pre-filter to skip lines with no image signatures
      if (!this.quickCheck(text, supportedExtensions, enableRemote)) {
        continue;
      }

      // 1. Quoted Data URIs first (to capture full SVGs with spaces)
      this.collectMatches(text, quotedDataUriRegex, 2, lineIndex, matches, enableRemote);

      // 2. Unquoted Data URIs
      this.collectDataUris(text, bareDataUriRegex, lineIndex, matches);

      // 3. src="..." attributes (single or multi-line tags)
      this.collectMatches(text, srcAttrRegex, 2, lineIndex, matches, enableRemote);

      // 4. Quoted paths with known extensions
      this.collectMatches(text, quotedRegex, 2, lineIndex, matches, enableRemote);

      // 5. CSS url()
      this.collectMatches(text, cssUrlRegex, 2, lineIndex, matches, enableRemote);

      // 6. Markdown links
      this.collectMatches(text, markdownRegex, 2, lineIndex, matches, enableRemote);

      // 7. Remote URLs (if remote enabled)
      if (enableRemote) {
        this.collectBareUrls(text, remoteUrlRegex, lineIndex, matches);
        this.collectBareUrls(text, knownImageCdnRegex, lineIndex, matches);
        this.collectBareUrls(text, remoteQueryImgRegex, lineIndex, matches);
      }
    }

    return this.deduplicateMatches(matches);
  }

  /**
   * Fast line pre-filter: skips line only if it has no image extensions, no data URI, and no http(s)
   */
  private static quickCheck(lineText: string, extensions: string[], enableRemote: boolean): boolean {
    const lower = lineText.toLowerCase();

    // Check data URIs
    if (lower.includes('data:image')) {
      return true;
    }

    // Check remote URLs
    if (enableRemote && (lower.includes('http://') || lower.includes('https://'))) {
      return true;
    }

    // Check src attribute
    if (lower.includes('src=')) {
      return true;
    }

    // Check image extensions
    for (let i = 0; i < extensions.length; i++) {
      if (lower.includes(extensions[i])) {
        return true;
      }
    }

    return false;
  }

  private static collectMatches(
    lineText: string,
    regex: RegExp,
    groupIndex: number,
    lineIndex: number,
    results: ImageMatch[],
    enableRemote: boolean
  ): void {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const rawPath = match[groupIndex];
      if (!rawPath) continue;

      const isRemote = rawPath.startsWith('http://') || rawPath.startsWith('https://');
      if (isRemote && !enableRemote) continue;

      const isDataUri = rawPath.startsWith('data:image');
      const startCol = match.index + match[0].indexOf(rawPath);
      const endCol = startCol + rawPath.length;

      const type: ImageSourceType = isDataUri ? 'data-uri' : isRemote ? 'remote' : 'local';

      results.push({
        rawPath,
        line: lineIndex,
        range: new vscode.Range(lineIndex, startCol, lineIndex, endCol),
        type,
      });
    }
  }

  private static collectBareUrls(
    lineText: string,
    regex: RegExp,
    lineIndex: number,
    results: ImageMatch[]
  ): void {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const rawPath = match[0];
      const startCol = match.index;
      const endCol = startCol + rawPath.length;

      results.push({
        rawPath,
        line: lineIndex,
        range: new vscode.Range(lineIndex, startCol, lineIndex, endCol),
        type: 'remote',
      });
    }
  }

  private static collectDataUris(
    lineText: string,
    regex: RegExp,
    lineIndex: number,
    results: ImageMatch[]
  ): void {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      const rawPath = match[0];
      const startCol = match.index;
      const endCol = startCol + rawPath.length;

      results.push({
        rawPath,
        line: lineIndex,
        range: new vscode.Range(lineIndex, startCol, lineIndex, endCol),
        type: 'data-uri',
      });
    }
  }

  /**
   * Removes duplicate or contained overlapping matches on the same line,
   * prioritizing the longest, most complete match.
   */
  private static deduplicateMatches(matches: ImageMatch[]): ImageMatch[] {
    // Sort matches: first by line, then by start character, then descending by length
    const sorted = [...matches].sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      if (a.range.start.character !== b.range.start.character) {
        return a.range.start.character - b.range.start.character;
      }
      return b.rawPath.length - a.rawPath.length;
    });

    const unique: ImageMatch[] = [];

    for (const m of sorted) {
      // Check if this match is contained within an already-accepted match on the same line
      const isContained = unique.some((existing) => {
        return (
          existing.line === m.line &&
          existing.range.start.character <= m.range.start.character &&
          existing.range.end.character >= m.range.end.character
        );
      });

      if (!isContained) {
        unique.push(m);
      }
    }

    return unique;
  }
}
