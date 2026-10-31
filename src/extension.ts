import * as vscode from 'vscode';
import * as path from 'path';
import { CachingRegistry } from './caching/CachingRegistry';
import { TemplateScanner, ScanConfig, ScanResult } from './scanner/TemplateScanner';
import { TemplateExplorerProvider, TemplateTreeNode } from './tree/TemplateExplorer';
import { ReferenceNavigator } from './navigation/ReferenceNavigator';
import { TemplateDocumentLinkProvider } from './navigation/TemplateDocumentLinks';
import { ExtensionSettingsManager } from './extensionSettings';
import { YamlValidator } from './validation/YamlValidator';
import { TemplateNode, TemplateScanError } from './types/templateReference';

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
  private disposables: vscode.Disposable[] = [];
  private readonly diagnostics: vscode.DiagnosticCollection;
  private scanResults: ScanResult[] = [];
  private scanDiagnostics = new Map<string, vscode.Diagnostic[]>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.diagnostics = vscode.languages.createDiagnosticCollection('adoInspector');

    // Register disposables
    this.registerDisposables();
    this.extensionContext.subscriptions.push(...this.disposables);
    this.extensionContext.subscriptions.push(this.diagnostics);

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

    // Tree view provider
    this.disposables.push(
      vscode.window.registerTreeDataProvider(
        'adoInspectorTemplateTree',
        this.treeProvider
      )
    );

    this.disposables.push(
      vscode.languages.registerDocumentLinkProvider(
        { language: 'yaml', scheme: 'file' },
        new TemplateDocumentLinkProvider()
      )
    );

    // File change listener
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(
        (event) => this.onTextDocumentChange(event)
      )
    );

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(
        (document) => this.onDocumentSaved(document)
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

    const yamlWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        this.settingsManager.resolveScanRoot(),
        '**/*.{yml,yaml}'
      )
    );
    this.disposables.push(yamlWatcher);
    this.disposables.push(
      yamlWatcher.onDidChange((uri) => void this.onWatchedFileChange(uri.fsPath))
    );
    this.disposables.push(
      yamlWatcher.onDidCreate((uri) => void this.onWatchedFileChange(uri.fsPath))
    );
    this.disposables.push(
      yamlWatcher.onDidDelete((uri) => void this.onWatchedFileChange(uri.fsPath))
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
    this.scanResults = results;
    this.publishTemplateDiagnostics();
    this.updateTreeForActiveDocument();

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

    const currentPath = path.resolve(activeEditor.document.uri.fsPath);
    const references = this.scanResults
      .flatMap((result) => result.tree.references)
      .filter((reference) => path.resolve(reference.path) === currentPath);
    const sources = [...new Set(references.map((reference) => reference.sourceFile))];
    if (sources.length === 0) {
      vscode.window.showInformationMessage('No references found in the configured scan folder.');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      sources.map((source) => ({
        label: path.basename(source),
        description: source,
        source,
      })),
      { placeHolder: 'Open a file that references this template' }
    );
    if (selected) {
      const document = await vscode.workspace.openTextDocument(selected.source);
      await vscode.window.showTextDocument(document);
    }
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
  private onTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const document = event.document;
    if (document.languageId === 'yaml') {
      this.validateDocument(document);
    }
  }

  private async onDocumentSaved(document: vscode.TextDocument): Promise<void> {
    if (document.languageId === 'yaml') {
      await this.onWatchedFileChange(document.uri.fsPath);
    }
  }

  private onWatchedFileChange(filePath: string): void {
    const changedPath = path.resolve(filePath);
    this.cachingRegistry.delete(changedPath);
    for (const [cachedPath, entry] of this.cachingRegistry.getAllEntries()) {
      if (entry.data.references.some((reference) => path.resolve(reference.path) === changedPath)) {
        this.cachingRegistry.delete(cachedPath);
      }
    }
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.scanAllTemplates();
    }, 150);
  }

  private validateDocument(document: vscode.TextDocument): void {
    const diagnostics = this.yamlValidator
      .validate(document.getText(), document.fileName)
      .map((item) => {
        const severity = item.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : item.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information;
        const line = Math.max(0, item.line - 1);
        const character = Math.max(0, item.column - 1);
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(line, character, line, character + 1),
          item.message,
          severity
        );
        diagnostic.code = item.code;
        diagnostic.source = 'Azure DevOps YAML Inspector';
        return diagnostic;
      });
    this.diagnostics.set(document.uri, [
      ...diagnostics,
      ...(this.scanDiagnostics.get(document.uri.fsPath) ?? []),
    ]);
  }

  private publishTemplateDiagnostics(): void {
    const grouped = new Map<string, vscode.Diagnostic[]>();
    const seen = new Set<string>();
    for (const result of this.scanResults) {
      for (const issue of result.errors) {
        const key = `${issue.file}|${issue.line}|${issue.column}|${issue.message}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const fileDiagnostics = grouped.get(issue.file) ?? [];
        fileDiagnostics.push(this.toDiagnostic(issue));
        grouped.set(issue.file, fileDiagnostics);
      }
    }

    for (const oldPath of this.scanDiagnostics.keys()) {
      if (!grouped.has(oldPath)) {
        this.diagnostics.delete(vscode.Uri.file(oldPath));
      }
    }
    this.scanDiagnostics = grouped;
    for (const [filePath, fileDiagnostics] of grouped) {
      this.diagnostics.set(vscode.Uri.file(filePath), fileDiagnostics);
    }
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === 'yaml') {
        this.validateDocument(document);
      }
    }
  }

  private toDiagnostic(issue: TemplateScanError): vscode.Diagnostic {
    const severity = issue.type === 'error'
      ? vscode.DiagnosticSeverity.Error
      : issue.type === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
    const line = Math.max(0, issue.line - 1);
    const character = Math.max(0, issue.column - 1);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line, character, line, character + 1),
      issue.message,
      severity
    );
    diagnostic.code = 'ADO_TEMPLATE_REFERENCE';
    diagnostic.source = 'Azure DevOps YAML Inspector';
    return diagnostic;
  }

  private updateTreeForActiveDocument(): void {
    const activeDocument = vscode.window.activeTextEditor?.document;
    if (!activeDocument) {
      this.treeProvider.setTree(this.scanResults[0]?.tree ?? null);
      return;
    }

    const activePath = path.resolve(activeDocument.uri.fsPath);
    const incomingReferences = this.scanResults
      .flatMap((result) => result.tree.references)
      .filter((reference) => path.resolve(reference.path) === activePath);
    const referencingFiles = [...new Set(incomingReferences.map((reference) => reference.sourceFile))];

    if (referencingFiles.length > 0) {
      const root: TemplateNode = {
        path: activePath,
        depth: 0,
        isRoot: true,
        parameters: null,
        referencedLine: 0,
        children: referencingFiles.map((sourceFile) => ({
          path: sourceFile,
          depth: 1,
          isRoot: false,
          parameters: null,
          referencedLine: 0,
          children: [],
        })),
      };
      this.treeProvider.setTree({
        root: activePath,
        tree: root,
        references: incomingReferences,
        errors: [],
      });
      return;
    }

    const activeResult = this.scanResults.find(
      (result) => path.resolve(result.tree.root) === activePath
    );
    this.treeProvider.setTree(activeResult?.tree ?? this.scanResults[0]?.tree ?? null);
  }

  /**
   * Handle document open events.
   */
  private async onDocumentOpen(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'yaml') {
      return;
    }

    this.validateDocument(document);
    const filePath = document.uri.fsPath;
    const cached = this.cachingRegistry.get(filePath);

    if (cached) {
      this.updateTreeForActiveDocument();
    } else {
      this.scheduleScan(filePath);
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
  private scheduleScan(filePath: string): void {
    // Use setTimeout to avoid blocking the UI
    setTimeout(async () => {
      try {
        const config: ScanConfig = {
          maxDepth: this.settingsManager.settings.maxDepth,
          minDepth: this.settingsManager.settings.minDepth,
          includePatterns: this.settingsManager.settings.includePatterns,
          excludePatterns: this.settingsManager.settings.excludePatterns,
        };

        const result = await this.templateScanner.scan(filePath, config);
        this.scanResults = [
          ...this.scanResults.filter((item) => path.resolve(item.tree.root) !== path.resolve(filePath)),
          result,
        ];
        this.publishTemplateDiagnostics();
        this.updateTreeForActiveDocument();

        // Persist cache
        if (this.settingsManager.settings.cacheEnabled) {
          await this.cachingRegistry.persist();
        }

        console.log(
          `[ADO Inspector] Scan complete for: ${filePath}. Errors: ${result.errors.length}`
        );
      } catch (error) {
        console.error(
          `[ADO Inspector] Scan failed for ${filePath}:`,
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

export function activate(context: vscode.ExtensionContext): void {
  new ADOYAMLInspectorExtension(context);
}

export function deactivate(): void {}
