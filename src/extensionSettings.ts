import * as path from 'path';
import * as vscode from 'vscode';

export interface ExtensionSettings {
  enabled: boolean;
  scanRoot: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxDepth: number;
  minDepth: number;
  cacheEnabled: boolean;
  cachePath: string;
  showPanel: boolean;
  highlightReferences: boolean;
}

export class ExtensionSettingsManager {
  private readonly extensionId = 'adoInspector';
  private readonly schema = {
    properties: {
      enabled: {
        type: 'boolean',
        default: true,
        description: 'Enable the Azure DevOps YAML Inspector extension.',
      },
      scanRoot: {
        type: 'string',
        default: '${workspaceFolder}',
        description:
          'Root directory to scan for Azure DevOps YAML files. Can be an absolute path or relative to the workspace root.',
      },
      includePatterns: {
        type: 'array',
        items: { type: 'string' },
        default: ['*.yml', '*.yaml'],
        description:
          'File patterns to include when scanning for YAML files.',
      },
      excludePatterns: {
        type: 'array',
        items: { type: 'string' },
        default: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.git/**',
        ],
        description:
          'File patterns to exclude when scanning for YAML files.',
      },
      maxDepth: {
        type: 'number',
        default: 3,
        minimum: 1,
        maximum: 10,
        description:
          'Maximum depth of template traversal. A value of 3 means the extension will traverse up to 3 levels of nested templates.',
      },
      minDepth: {
        type: 'number',
        default: 0,
        minimum: 0,
        maximum: 10,
        description:
          'Minimum depth of template traversal. A value of 1 excludes the root file itself.',
      },
      cacheEnabled: {
        type: 'boolean',
        default: true,
        description:
          'Enable caching of resolved templates to avoid re-scanning.',
      },
      cachePath: {
        type: 'string',
        default: '~/.ado-cache',
        description:
          'Path to the cache directory for storing resolved templates.',
      },
      showPanel: {
        type: 'boolean',
        default: true,
        description:
          'Show the YAML Inspector panel when opening a YAML file.',
      },
      highlightReferences: {
        type: 'boolean',
        default: true,
        description:
          'Highlight template references in the editor.',
      },
    },
    required: [],
    additionalProperties: false,
  };

  private settings: ExtensionSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  /**
   * Load settings from VS Code configuration.
   */
  private loadSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration(this.extensionId);

    return {
      enabled: config.get<boolean>('enabled', true),
      scanRoot: config.get<string>('scanRoot', '${workspaceFolder}'),
      includePatterns: config.get<string[]>('includePatterns', [
        '*.yml',
        '*.yaml',
      ]),
      excludePatterns: config.get<string[]>('excludePatterns', [
        '**/node_modules/**',
        '**/dist/**',
        '**/.git/**',
      ]),
      maxDepth: config.get<number>('maxDepth', 3),
      minDepth: config.get<number>('minDepth', 0),
      cacheEnabled: config.get<boolean>('cacheEnabled', true),
      cachePath: config.get<string>('cachePath', '~/.ado-cache'),
      showPanel: config.get<boolean>('showPanel', true),
      highlightReferences: config.get<boolean>('highlightReferences', true),
    };
  }

  /**
   * Get the current settings.
   */
  getSettings(): ExtensionSettings {
    return this.settings;
  }

  /**
   * Update a specific setting.
   */
  updateSetting<T extends keyof ExtensionSettings>(
    key: T,
    value: ExtensionSettings[T]
  ): void {
    vscode.workspace.getConfiguration(this.extensionId).update(
      key,
      value,
      vscode.ConfigurationTarget.Global
    );

    this.settings = this.loadSettings();
  }

  /**
   * Resolve the scan root path.
   */
  resolveScanRoot(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return this.settings.scanRoot;
    }

    // If scanRoot is relative, resolve it relative to the workspace
    if (!path.isAbsolute(this.settings.scanRoot)) {
      return path.resolve(workspaceFolder, this.settings.scanRoot);
    }

    return this.settings.scanRoot;
  }

  /**
   * Get the workspace folder URI.
   */
  getWorkspaceFolderUri(): vscode.Uri | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  /**
   * Check if a file should be included in the scan.
   */
  shouldIncludeFile(filePath: string): boolean {
    const stat = vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    if (stat === undefined || stat.type === vscode.FileType.Directory) {
      return false;
    }

    const fileName = path.basename(filePath);
    const relativePath = path.relative(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      filePath
    );

    // Check include patterns
    const matchesInclude = this.settings.includePatterns.some((pattern) =>
      new RegExp(pattern).test(fileName)
    );

    if (!matchesInclude) {
      return false;
    }

    // Check exclude patterns
    const matchesExclude = this.settings.excludePatterns.some((pattern) =>
      new RegExp(pattern).test(relativePath)
    );

    return !matchesExclude;
  }

  /**
   * Get the file name for a path.
   */
  getFileName(filePath: string): string {
    return path.basename(filePath);
  }
}
