import * as vscode from 'vscode';
import * as path from 'path';
import { CachingRegistry } from './caching/CachingRegistry';
import { TemplateScanner, ScanConfig } from './scanner/TemplateScanner';
import { TemplateExplorerProvider, TemplateTreeNode } from './tree/TemplateExplorer';
import { ReferenceNavigator } from './navigation/ReferenceNavigator';
import { ExtensionSettingsManager, ExtensionSettings } from './extensionSettings';
import { YamlValidator } from './validation/YamlValidator';

/**
 * Azure DevOps YAML Inspector Extension
 * 
 * This extension provides:
 * - Template reference resolution
 * - Configurable depth control for template traversal
 * - LRU caching with disk persistence
 * - Collapsible breadcrumb navigation
 * - Read-only template navigation
 * - Parameter validation
 * - Variable propagation validation (Phase 8)
 */
export class ADOYAMLInspectorExtension {
  private extensionContext: vscode.ExtensionContext;
  private settingsManager: ExtensionSettingsManager;
  private cachingRegistry: CachingRegistry;
  private templateScanner: TemplateScanner;
  private yamlValidator: YamlValidator;
  private treeProvider: TemplateExplorerProvider;
  private referenceNavigator: ReferenceNavigator;
  private panel: vscode.WebviewPanel | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(extensionContext: vscode.ExtensionContext) {
    this.extensionContext = extensionContext;
    this.settingsManager = new ExtensionSettingsManager();
    this.cachingRegistry = new CachingRegistry(
      this.settingsManager.resolveCachePath(),
      1000,
      this.settingsManager.settings.cacheEnabled
    );
    this.templateScanner = new TemplateScanner(
      this.cachingRegistry,
      this.settingsManager.resolveScanRoot()
    );
    this.yamlValidator = new YamlValidator();
    this.treeProvider = new TemplateExplorerProvider();
    this.referenceNavigator = new ReferenceNavigator(this.treeProvider);

    // Register disposables
    this.registerDisposables();

    // Initialize on activation
    this.initialize();
  }

  /**
   * Register all extension disposables.
   */
  private registerDisposables(): void {
    // Commands
    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.scanTemplates', async () => {
        await this.scanAllTemplates();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.clearCache', async () => {
        await this.clearCache();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.openReferencingFile', async () => {
        await this.openReferencingFile();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.navigateToTemplate', async (node: TemplateTreeNode) => {
        await this.navigateToNode(node);
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleNode', (node: TemplateTreeNode) => {
        this.treeProvider.toggleExpansion(node);
      })
    );

    // Panel provider
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(
        'adoInspectorPanel',
        new YamlInspectorPanelProvider(this),
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
        }
      )
    );

    // Tree view provider
    this.disposables.push(
      vscode.window.registerTreeDataProvider(
        'adoInspectorTemplateTree',
        this.treeProvider
      )
    );

    // File change listener
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(
        (event) => this.onTextDocumentChange(event)
      )
    );

    // Document open listener
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(
        (document) => this.onDocumentOpen(document)
      )
    );

    // Workspace folder change listener
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(
        () => this.onWorkspaceFolderChange()
      )
    );
  }

  /**
   * Initialize the extension.
   */
  private async initialize(): Promise<void> {
    console.log('[ADO Inspector] Extension activated');

    // Restore cache from disk
    if (this.settingsManager.settings.cacheEnabled) {
      await this.cachingRegistry.restoreFromDisk();
    }

    // Scan the workspace if there's a workspace folder
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      await this.scanAllTemplates();
    }
  }

  /**
   * Scan all YAML files in the workspace for template references.
   */
  private async scanAllTemplates(): Promise<void> {
    const config: ScanConfig = {
      maxDepth: this.settingsManager.settings.maxDepth,
      minDepth: this.settingsManager.settings.minDepth,
      includePatterns: this.settingsManager.settings.includePatterns,
      excludePatterns: this.settingsManager.settings.excludePatterns,
    };

    const scanRoot = this.settingsManager.resolveScanRoot();

    console.log(`[ADO Inspector] Scanning: ${scanRoot} (maxDepth: ${config.maxDepth})`);

    const results = await this.templateScanner.scanDirectory(scanRoot, config);

    console.log(
      `[ADO Inspector] Scan complete. Found ${results.length} files.`
    );

    // Persist cache
    if (this.settingsManager.settings.cacheEnabled) {
      await this.cachingRegistry.persist();
    }
  }

  /**
   * Clear the cache.
   */
  private async clearCache(): Promise<void> {
    this.cachingRegistry.clear();
    console.log('[ADO Inspector] Cache cleared');
  }

  /**
   * Open the referencing file for the current document.
   */
  private async openReferencingFile(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || activeEditor.document.languageId !== 'yaml') {
      vscode.window.showErrorMessage(
        'Please open a YAML file to open the referencing file.'
      );
      return;
    }

    // This would use the navigator to find the parent file
    // For now, show a message
    vscode.window.showInformationMessage(
      'Open Referencing File: Feature under development.'
    );
  }

  /**
   * Navigate to a specific node in the tree.
   */
  private async navigateToNode(node: TemplateTreeNode): Promise<void> {
    await this.referenceNavigator.navigateToNode(node);
  }

  /**
   * Handle text document changes.
   */
  private async onTextDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const document = event.document;

    // Only handle YAML files
    if (document.languageId !== 'yaml') {
      return;
    }

    // Check if the file is in the cache
    const fileUri = document.uri.toString();
    const cached = this.cachingRegistry.has(fileUri);

    if (cached) {
      console.log(
        `[ADO Inspector] Document changed: ${document.fileName} (cache hit)`
      );
      // The cache already has the result, no need to re-scan
      // In a more sophisticated implementation, we'd check if the change
      // affects template references and only re-scan if needed
    } else {
      console.log(
        `[ADO Inspector] Document changed: ${document.fileName} (cache miss)`
      );
      // Trigger a background scan
      this.scheduleScan(fileUri);
    }
  }

  /**
   * Handle document open events.
   */
  private async onDocumentOpen(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'yaml') {
      return;
    }

    const fileUri = document.uri.toString();
    const cached = this.cachingRegistry.has(fileUri);

    if (cached) {
      console.log(
        `[ADO Inspector] Document opened: ${document.fileName} (cache hit)`
      );
    } else {
      console.log(
        `[ADO Inspector] Document opened: ${document.fileName} (cache miss)`
      );
      this.scheduleScan(fileUri);
    }
  }

  /**
   * Handle workspace folder changes.
   */
  private async onWorkspaceFolderChange(): Promise<void> {
    console.log('[ADO Inspector] Workspace folder changed');
    await this.scanAllTemplates();
  }

  /**
   * Schedule a scan to run in the background.
   */
  private scheduleScan(fileUri: string): void {
    // Schedule a background scan
    const uri = vscode.Uri.parse(fileUri);
    const relativePath = vscode.workspace
      ? vscode.workspace.workspaceFolders
        ? path.relative(
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            uri.fsPath
          )
        : uri.fsPath
      : uri.fsPath;

    // Use setTimeout to avoid blocking the UI
    setTimeout(async () => {
      try {
        const config: ScanConfig = {
          maxDepth: this.settingsManager.settings.maxDepth,
          minDepth: this.settingsManager.settings.minDepth,
          includePatterns: this.settingsManager.settings.includePatterns,
          excludePatterns: this.settingsManager.settings.excludePatterns,
        };

        const result = await this.templateScanner.scan(relativePath, config);

        // Persist cache
        if (this.settingsManager.settings.cacheEnabled) {
          await this.cachingRegistry.persist();
        }

        console.log(
          `[ADO Inspector] Scan complete for: ${relativePath}. Errors: ${result.errors.length}`
        );
      } catch (error) {
        console.error(
          `[ADO Inspector] Scan failed for ${fileUri}:`,
          error
        );
      }
    }, 100);
  }

  /**
   * Resolve the scan root path.
   */
  private resolveScanRoot(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return this.settingsManager.settings.scanRoot;
    }

    if (!path.isAbsolute(this.settingsManager.settings.scanRoot)) {
      return path.resolve(workspaceFolder, this.settingsManager.settings.scanRoot);
    }

    return this.settingsManager.settings.scanRoot;
  }

  /**
   * Resolve the cache path.
   */
  private resolveCachePath(): string {
    const cachePath = this.settingsManager.settings.cachePath;

    // Resolve ~ to the user's home directory
    if (cachePath.startsWith('~')) {
      const home = require('os').homedir();
      return path.resolve(home, cachePath.slice(1));
    }

    return cachePath;
  }
}
