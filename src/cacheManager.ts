import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';

/**
 * Manages local caching of remote HTTP/HTTPS images and Data URIs
 * so VS Code's gutter and hover systems can render them via local file URIs.
 */
export class CacheManager {
  private cacheDir: string;
  private pendingDownloads = new Map<string, Promise<vscode.Uri | undefined>>();

  constructor(context: vscode.ExtensionContext) {
    this.cacheDir = path.join(context.globalStorageUri.fsPath, 'imgpreview-cache');
    this.ensureDirectoryExists(this.cacheDir);
  }

  /**
   * Returns a local file URI for a remote URL (downloading & caching if necessary)
   */
  public async getRemoteImageUri(url: string, maxSizeBytes: number): Promise<vscode.Uri | undefined> {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 24);

    // Check if any cached file with this hash prefix exists
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = await fs.promises.readdir(this.cacheDir);
        const match = files.find((f) => f.startsWith(hash));
        if (match) {
          const filePath = path.join(this.cacheDir, match);
          const stat = await fs.promises.stat(filePath);
          if (stat.size > 0) {
            return vscode.Uri.file(filePath);
          }
        }
      }
    } catch {
      // Continue to download
    }

    // Deduplicate in-flight downloads for the same URL
    if (this.pendingDownloads.has(url)) {
      return this.pendingDownloads.get(url);
    }

    const downloadPromise = this.downloadImage(url, hash, maxSizeBytes, 0);
    this.pendingDownloads.set(url, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.pendingDownloads.delete(url);
    }
  }

  /**
   * Saves a data URI (base64 or svg+xml) to local cache and returns file Uri
   */
  public async getDataUriFile(dataUri: string): Promise<vscode.Uri | undefined> {
    try {
      const match = dataUri.match(/^data:image\/([a-zA-Z0-9\+\-\.]+)(?:;([^,]+))?,([\s\S]*)$/i);
      if (!match) {
        return undefined;
      }

      const [, subType, encoding, data] = match;
      const isBase64 = encoding?.toLowerCase().includes('base64');
      const ext = subType.toLowerCase().includes('svg') ? 'svg' : subType.toLowerCase();

      const hash = crypto.createHash('sha256').update(dataUri).digest('hex').substring(0, 24);
      const filePath = path.join(this.cacheDir, `data_${hash}.${ext}`);

      if (fs.existsSync(filePath)) {
        if (ext === 'svg') {
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            if (!content.includes('width=') || !content.includes('height=')) {
              await fs.promises.writeFile(filePath, this.ensureSvgDimensions(content));
            }
          } catch {
            // Keep existing
          }
        }
        return vscode.Uri.file(filePath);
      }

      let buffer: Buffer;
      if (isBase64) {
        buffer = Buffer.from(data.trim(), 'base64');
        if (ext === 'svg') {
          const svgStr = buffer.toString('utf-8');
          const normalized = this.ensureSvgDimensions(svgStr);
          buffer = Buffer.from(normalized, 'utf-8');
        }
      } else {
        let rawData = data;
        if (rawData.includes('%')) {
          try {
            rawData = decodeURIComponent(rawData);
          } catch {
            rawData = rawData.replace(/%23/g, '#');
          }
        }
        if (ext === 'svg') {
          if (!rawData.includes('</svg>') && !rawData.includes('/>')) {
            return undefined;
          }
          rawData = this.ensureSvgDimensions(rawData);
        }
        buffer = Buffer.from(rawData, 'utf-8');
      }

      await fs.promises.writeFile(filePath, buffer);
      return vscode.Uri.file(filePath);
    } catch {
      return undefined;
    }
  }

  /**
   * Clears all cached images and notifies the user
   */
  public async clearCache(): Promise<void> {
    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = await fs.promises.readdir(this.cacheDir);
        for (const file of files) {
          await fs.promises.unlink(path.join(this.cacheDir, file));
        }
      }
      vscode.window.showInformationMessage('Img Preview: Image cache successfully cleared.');
    } catch (err) {
      vscode.window.showErrorMessage(`Img Preview: Failed to clear cache: ${err}`);
    }
  }

  /**
   * Downloads a remote image with browser User-Agent, redirects, and content-type detection
   */
  private downloadImage(
    url: string,
    fileHash: string,
    maxSizeBytes: number,
    redirectCount: number
  ): Promise<vscode.Uri | undefined> {
    return new Promise((resolve) => {
      if (redirectCount > 5) {
        return resolve(undefined);
      }

      try {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const timeoutMs = 8000;

        const req = client.get(
          parsedUrl,
          {
            timeout: timeoutMs,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
          },
          (res: http.IncomingMessage) => {
            // Handle HTTP redirects (301, 302, 303, 307, 308)
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              const redirectUrl = res.headers.location.startsWith('http')
                ? res.headers.location
                : new URL(res.headers.location, url).toString();
              return resolve(this.downloadImage(redirectUrl, fileHash, maxSizeBytes, redirectCount + 1));
            }

            if (res.statusCode !== 200) {
              return resolve(undefined);
            }

            // Determine file extension from Content-Type header or URL
            const contentType = (res.headers['content-type'] || '').toLowerCase();
            const ext = this.extFromContentType(contentType) || this.extractExtension(url) || 'png';
            const destPath = path.join(this.cacheDir, `${fileHash}.${ext}`);

            let downloaded = 0;
            const chunks: Buffer[] = [];

            res.on('data', (chunk: Buffer) => {
              downloaded += chunk.length;
              if (downloaded > maxSizeBytes) {
                req.destroy();
                return resolve(undefined);
              }
              chunks.push(chunk);
            });

            res.on('end', async () => {
              try {
                let buffer = Buffer.concat(chunks);
                if (ext === 'svg') {
                  const svgStr = buffer.toString('utf-8');
                  const normalized = this.ensureSvgDimensions(svgStr);
                  buffer = Buffer.from(normalized, 'utf-8');
                }
                await fs.promises.writeFile(destPath, buffer);
                resolve(vscode.Uri.file(destPath));
              } catch {
                resolve(undefined);
              }
            });

            res.on('error', () => resolve(undefined));
          }
        );

        req.on('timeout', () => {
          req.destroy();
          resolve(undefined);
        });

        req.on('error', () => resolve(undefined));
      } catch {
        resolve(undefined);
      }
    });
  }

  private extFromContentType(contentType: string): string | undefined {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('svg')) return 'svg';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('avif')) return 'avif';
    if (contentType.includes('bmp')) return 'bmp';
    if (contentType.includes('x-icon')) return 'ico';
    return undefined;
  }

  private extractExtension(url: string): string | undefined {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).replace('.', '').toLowerCase();
      return ext || undefined;
    } catch {
      return undefined;
    }
  }

  private ensureSvgDimensions(svgText: string): string {
    const hasWidth = /<svg\b[^>]*?\swidth=/i.test(svgText);
    const hasHeight = /<svg\b[^>]*?\sheight=/i.test(svgText);
    if (hasWidth && hasHeight) {
      return svgText;
    }

    const viewBoxMatch = svgText.match(/viewBox=["']\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
    let width = '24';
    let height = '24';
    if (viewBoxMatch) {
      width = viewBoxMatch[3];
      height = viewBoxMatch[4];
    }

    let result = svgText;
    if (!hasWidth && !hasHeight) {
      result = result.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
    } else if (!hasWidth) {
      result = result.replace(/<svg\b/i, `<svg width="${width}"`);
    } else if (!hasHeight) {
      result = result.replace(/<svg\b/i, `<svg height="${height}"`);
    }

    return result;
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
