import * as vscode from 'vscode';

/**
 * Image match type detected by document scanner
 */
export type ImageSourceType = 'local' | 'remote' | 'data-uri';

/**
 * Represents a matched image path/URI inside a document
 */
export interface ImageMatch {
  /** The raw path/URI string extracted from code */
  rawPath: string;
  /** Exact range of the image path in the document */
  range: vscode.Range;
  /** Zero-indexed line number in the document */
  line: number;
  /** Category of the image source */
  type: ImageSourceType;
}

/**
 * Parsed metadata for an image (dimensions, size, format)
 */
export interface ImageMetadata {
  /** Resolved local file URI suitable for gutter and hover */
  uri: vscode.Uri;
  /** Original path or URL as written in code */
  originalPath: string;
  /** Width in pixels if detectable */
  width?: number;
  /** Height in pixels if detectable */
  height?: number;
  /** File size in bytes */
  sizeBytes?: number;
  /** Human readable file size (e.g., "42.5 KB") */
  formattedSize?: string;
  /** Image format (e.g., "png", "svg", "webp") */
  format?: string;
  /** MIME type (e.g., "image/png") */
  mime?: string;
  /** Error message if loading or parsing failed */
  error?: string;
}

/**
 * Extension configuration interface
 */
export interface ExtensionConfig {
  enableGutter: boolean;
  enableHover: boolean;
  gutterIconSize: 'contain' | 'cover' | 'auto';
  debounceDelay: number;
  maxFileSizeMB: number;
  enableRemoteImages: boolean;
  supportedExtensions: string[];
}

