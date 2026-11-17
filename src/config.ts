import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

/**
 * Manages access to user configuration settings with type safety
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = 'imgPreview';

  /**
   * Retrieves the current extension configuration
   */
  public static getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

    return {
      enableGutter: config.get<boolean>('enableGutter', true),
      enableHover: config.get<boolean>('enableHover', true),
      gutterIconSize: config.get<'contain' | 'cover' | 'auto'>('gutterIconSize', 'contain'),
      debounceDelay: config.get<number>('debounceDelay', 200),
      maxFileSizeMB: config.get<number>('maxFileSizeMB', 25),
      enableRemoteImages: config.get<boolean>('enableRemoteImages', true),
      supportedExtensions: config.get<string[]>('supportedExtensions', [
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'apng'
      ]),
    };
  }

  /**
   * Toggles gutter previews on or off in user settings
   */
  public static async toggleGutter(): Promise<boolean> {
    const current = this.getConfig().enableGutter;
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('enableGutter', !current, vscode.ConfigurationTarget.Global);
    return !current;
  }
}

