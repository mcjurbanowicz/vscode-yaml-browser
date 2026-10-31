import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { CachingRegistry } from './caching/CachingRegistry';
import { TemplateScanner, ScanConfig, ScanResult } from './scanner/TemplateScanner';
import { TemplateExplorerProvider, TemplateTreeNode } from './tree/TemplateExplorer';
import { TemplateDocumentLinkProvider } from './navigation/TemplateDocumentLinks';
import { ExtensionSettingsManager } from './extensionSettings';
import { YamlValidator } from './validation/YamlValidator';
import { TemplateNode, TemplateScanError } from './types/templateReference';
import { YamlStructureItem, YamlStructureViewProvider } from './tree/YamlStructureView';
import { TemplateExpander } from './templates/TemplateExpander';

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
  private readonly templateTreeView: vscode.TreeView<TemplateTreeNode>;
  private readonly structureTreeProvider: YamlStructureViewProvider;
  private readonly structureTreeView: vscode.TreeView<YamlStructureItem>;
  private disposables: vscode.Disposable[] = [];
  private readonly diagnostics: vscode.DiagnosticCollection;
  private readonly templateExpander = new TemplateExpander();
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
    this.templateTreeView = vscode.window.createTreeView(
      'adoInspectorPanelTemplateExplorer',
      { treeDataProvider: this.treeProvider }
    );
    this.structureTreeProvider = new YamlStructureViewProvider();
    this.structureTreeView = vscode.window.createTreeView(
      'adoInspectorPanelStructureTree',
      { treeDataProvider: this.structureTreeProvider }
    );
    this.diagnostics = vscode.languages.createDiagnosticCollection('adoInspector');

    // Register disposables
    this.registerDisposables();
    this.extensionContext.subscriptions.push(...this.disposables);
    this.extensionContext.subscriptions.push(this.templateTreeView);
    this.extensionContext.subscriptions.push(this.structureTreeView);
    this.extensionContext.subscriptions.push(this.diagnostics);
    this.extensionContext.subscriptions.push(this.structureTreeProvider);

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
      vscode.commands.registerCommand(
        'adoInspector.navigateToYamlElement',
        async (item: YamlStructureItem) => this.navigateToYamlElement(item)
      )
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.collapseYaml', async () => {
        await this.foldActiveYaml('editor.foldAll');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.expandYaml', async () => {
        await this.foldActiveYaml('editor.unfoldAll');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.collapseStructureTree', async () => {
        await this.structureTreeProvider.collapseAll();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.expandStructureTree', async () => {
        await this.structureTreeProvider.expandAll(this.structureTreeView);
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.validateYaml', () => {
        this.validateActiveYaml();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.expandTemplates', async () => {
        await this.expandActiveTemplates();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleShowConditions', async () => {
        await this.toggleStructureSetting('showConditions');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleShowStageParameters', async () => {
        await this.toggleStructureSetting('showStageParameters');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleShowJobParameters', async () => {
        await this.toggleStructureSetting('showJobParameters');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleShowStepParameters', async () => {
        await this.toggleStructureSetting('showStepParameters');
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('adoInspector.toggleNode', (node: TemplateTreeNode) => {
        this.treeProvider.toggleExpansion(node);
      })
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

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document.languageId === 'yaml') {
          this.updateTreeForActiveDocument();
        } else {
          this.updateTreeForActiveDocument();
        }
      })
    );

    // Workspace folder change listener
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(
        () => this.onWorkspaceFolderChange()
      )
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('adoInspector')) {
          this.settingsManager.refreshSettings();
          this.updateTreeForActiveDocument();
        }
      })
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
    await this.cachingRegistry.persist();
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
    await this.treeProvider.openTemplate(node);
  }

  private async navigateToYamlElement(item: YamlStructureItem): Promise<void> {
    if (!item.filePath) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(item.filePath);
    const editor = await vscode.window.showTextDocument(document);
    const position = document.positionAt(item.offset ?? 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter
    );
  }

  private async expandActiveTemplates(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== 'yaml') {
      vscode.window.showErrorMessage('Open a YAML file before expanding templates.');
      return;
    }

    try {
      const content = await this.templateExpander.expand(
        document.uri.fsPath,
        document.getText()
      );
      const expandedDocument = await vscode.workspace.openTextDocument({
        language: 'yaml',
        content,
      });
      await vscode.window.showTextDocument(expandedDocument, { preview: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Could not expand templates: ${message}`);
    }
  }

  private async foldActiveYaml(command: 'editor.foldAll' | 'editor.unfoldAll'): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'yaml') {
      await vscode.window.showInformationMessage('Open a YAML file before using this command.');
      return;
    }
    await vscode.commands.executeCommand(command);
  }

  /**
   * Handle text document changes.
   */
  private onTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    const document = event.document;
    if (document.languageId === 'yaml') {
      this.validateDocument(document);
      if (vscode.window.activeTextEditor?.document.uri.toString() === document.uri.toString()) {
        this.updateTreeForActiveDocument();
      }
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

  private validateActiveYaml(): void {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== 'yaml') {
      void vscode.window.showErrorMessage('Open a YAML file to validate it.');
      return;
    }

    this.validateDocument(document);
    const diagnostics = this.diagnostics.get(document.uri) ?? [];
    if (diagnostics.length === 0) {
      void vscode.window.showInformationMessage('No YAML issues found.');
      return;
    }

    const errors = diagnostics.filter(
      (diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error
    ).length;
    const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Warning
    ).length;
    void vscode.window.showWarningMessage(
      `Validation found ${diagnostics.length} issue(s): ${errors} error(s), ${warnings} warning(s).`
    );
  }

  private async toggleStructureSetting(
    key: 'showConditions' | 'showStageParameters' | 'showJobParameters' | 'showStepParameters'
  ): Promise<void> {
    await this.settingsManager.updateSetting(key, !this.settingsManager.settings[key]);
    this.updateTreeForActiveDocument();
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
    const references = this.scanResults.flatMap((result) => result.tree.references);
    this.structureTreeProvider.setDocument(
      activeDocument?.languageId === 'yaml' ? activeDocument : undefined,
      references,
      this.settingsManager.settings
    );
    if (!activeDocument) {
      this.treeProvider.setTree(this.scanResults[0]?.tree ?? null);
      return;
    }
    if (activeDocument.languageId !== 'yaml') {
      this.treeProvider.setTree(null);
      return;
    }

    const activePath = path.resolve(activeDocument.uri.fsPath);
    const normalizePath = (filePath: string): string => {
      const normalizedPath = path.resolve(filePath);
      return process.platform === 'win32'
        ? normalizedPath.toLowerCase()
        : normalizedPath;
    };
    const activePathKey = normalizePath(activePath);
    const outgoingReferences = references.filter(
      (reference) => normalizePath(reference.sourceFile) === activePathKey
    );
    const incomingReferences = references.filter(
      (reference) => normalizePath(reference.path) === activePathKey
    );
    const activeResult = this.scanResults.find(
      (result) => normalizePath(result.tree.root) === activePathKey
    );
    const children: TemplateNode[] = [];
    const seenEdges = new Set<string>();

    for (const reference of outgoingReferences) {
      const targetPath = path.resolve(reference.path);
      const edgeKey = `references|${normalizePath(targetPath)}`;
      if (normalizePath(targetPath) !== activePathKey && !seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        children.push({
          path: targetPath,
          depth: 1,
          isRoot: false,
          relationship: 'references',
          parameters: reference.parameters,
          referencedLine: reference.line,
          children: [],
        });
      }
    }

    for (const reference of incomingReferences) {
      const sourcePath = path.resolve(reference.sourceFile);
      const edgeKey = `referenced-by|${normalizePath(sourcePath)}`;
      if (normalizePath(sourcePath) !== activePathKey && !seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        children.push({
          path: sourcePath,
          depth: 1,
          isRoot: false,
          relationship: 'referenced-by',
          parameters: null,
          referencedLine: reference.line,
          children: [],
        });
      }
    }

    if (children.length > 0) {
      const root: TemplateNode = {
        path: activePath,
        depth: 0,
        isRoot: true,
        parameters: activeResult?.tree.tree.parameters ?? null,
        referencedLine: 0,
        children,
      };
      this.treeProvider.setTree({
        root: activePath,
        tree: root,
        references: [...outgoingReferences, ...incomingReferences],
        errors: [],
      });
      return;
    }

    this.treeProvider.setTree(activeResult?.tree ?? null);
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
      const home = os.homedir();
      return path.resolve(home, cachePath.slice(1));
    }

    return cachePath;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  new ADOYAMLInspectorExtension(context);
}

export function deactivate(): void {}
