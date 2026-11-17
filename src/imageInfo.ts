import * as fs from 'fs';
import * as path from 'path';
import { imageSize } from 'image-size';
import { ImageMetadata } from './types';
import * as vscode from 'vscode';

/**
 * Utility to extract image dimensions, format, and file size
 */
export class ImageInfoReader {
  /**
   * Reads metadata for a local image file
   */
  public static async getInfo(uri: vscode.Uri, originalPath: string): Promise<ImageMetadata> {
    const fsPath = uri.fsPath;

    if (!fs.existsSync(fsPath)) {
      return {
        uri,
        originalPath,
        error: 'File does not exist',
      };
    }

    try {
      const stats = await fs.promises.stat(fsPath);
      const sizeBytes = stats.size;
      const formattedSize = this.formatBytes(sizeBytes);
      const ext = path.extname(fsPath).replace('.', '').toLowerCase();

      let width: number | undefined;
      let height: number | undefined;
      let format = ext;

      try {
        // First try reading header bytes (first 8KB) for fast detection without reading large files entirely
        let buffer: Buffer;
        if (stats.size > 8192) {
          const handle = await fs.promises.open(fsPath, 'r');
          const tempBuf = Buffer.alloc(8192);
          const { bytesRead } = await handle.read(tempBuf, 0, 8192, 0);
          await handle.close();
          buffer = tempBuf.subarray(0, bytesRead);
        } else {
          buffer = await fs.promises.readFile(fsPath);
        }

        try {
          const dimensions = imageSize(buffer);
          width = dimensions.width;
          height = dimensions.height;
          if (dimensions.type) {
            format = dimensions.type;
          }
        } catch {
          // If partial buffer wasn't enough (e.g. larger SVG / WebP header), try full file buffer
          if (stats.size > 8192) {
            const fullBuffer = await fs.promises.readFile(fsPath);
            const dimensions = imageSize(fullBuffer);
            width = dimensions.width;
            height = dimensions.height;
            if (dimensions.type) {
              format = dimensions.type;
            }
          }
        }
      } catch {
        // Fallback for SVG if image-size encounters issues
        if (ext === 'svg') {
          const svgDimensions = await this.readSvgDimensions(fsPath);
          width = svgDimensions.width;
          height = svgDimensions.height;
        }
      }

      const mime = this.getMimeType(format);

      return {
        uri,
        originalPath,
        width,
        height,
        sizeBytes,
        formattedSize,
        format: format.toUpperCase(),
        mime,
      };
    } catch (err) {
      return {
        uri,
        originalPath,
        error: String(err),
      };
    }
  }

  /**
   * Human readable file size formatter (e.g. 42.8 KB, 1.2 MB)
   */
  public static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return `${val} ${sizes[i]}`;
  }

  /**
   * Fallback dimension extractor for SVG files using viewBox or width/height attributes
   */
  private static async readSvgDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
    try {
      const handle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(2048);
      const { bytesRead } = await handle.read(buffer, 0, 2048, 0);
      await handle.close();

      const text = buffer.toString('utf-8', 0, bytesRead);

      // Check for width and height attributes in <svg ...>
      const widthMatch = text.match(/<svg[^>]*?\swidth=["']([0-9.]+)(px)?["']/i);
      const heightMatch = text.match(/<svg[^>]*?\sheight=["']([0-9.]+)(px)?["']/i);

      let width = widthMatch ? parseFloat(widthMatch[1]) : undefined;
      let height = heightMatch ? parseFloat(heightMatch[1]) : undefined;

      // Check viewBox="min-x min-y width height"
      if (!width || !height) {
        const viewBoxMatch = text.match(/<svg[^>]*?\sviewBox=["']\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
        if (viewBoxMatch) {
          width = parseFloat(viewBoxMatch[3]);
          height = parseFloat(viewBoxMatch[4]);
        }
      }

      return { width, height };
    } catch {
      return {};
    }
  }

  private static getMimeType(format: string): string {
    const f = format.toLowerCase();
    switch (f) {
      case 'svg':
        return 'image/svg+xml';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'avif':
        return 'image/avif';
      case 'bmp':
        return 'image/bmp';
      case 'ico':
        return 'image/x-icon';
      default:
        return `image/${f}`;
    }
  }
}
