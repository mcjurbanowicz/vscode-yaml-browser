import * as vscode from 'vscode';
import { TemplateReference } from '../types/templateReference';
import { YamlStructureOptions, YamlStructureNode, buildYamlStructure } from './YamlStructure';
import { referenceDisplayPath } from './referencePath';

export class YamlStructureItem extends vscode.TreeItem {
  children: YamlStructureItem[] = [];
  parent: YamlStructureItem | undefined;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    readonly filePath?: string,
    readonly offset?: number,
    description?: string
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.tooltip = description ? `${label}\n${description}` : label;
  }
}

export class YamlStructureViewProvider implements vscode.TreeDataProvider<YamlStructureItem> {
  private readonly changeEmitter = new vscode.EventEmitter<
    YamlStructureItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private rootItems: YamlStructureItem[] = [];
  private allExpanded = true;

  getTreeItem(element: YamlStructureItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: YamlStructureItem): YamlStructureItem[] {
    return element?.children ?? this.rootItems;
  }

  getParent(element: YamlStructureItem): YamlStructureItem | undefined {
    return element.parent;
  }

  async collapseAll(): Promise<void> {
    this.setAllExpanded(false);
    await vscode.commands.executeCommand(
      'workbench.actions.treeView.adoInspectorPanelStructureTree.collapseAll'
    );
  }

  async expandAll(treeView: vscode.TreeView<YamlStructureItem>): Promise<void> {
    this.setAllExpanded(true);
    for (const item of this.rootItems) {
      await this.revealExpandedItems(treeView, item);
    }
  }

  private setAllExpanded(expanded: boolean): void {
    this.allExpanded = expanded;
    this.updateExpansionState(this.rootItems, expanded);
    this.changeEmitter.fire();
  }

  setDocument(
    document: vscode.TextDocument | undefined,
    references: TemplateReference[],
    options: YamlStructureOptions
  ): void {
    if (!document) {
      this.rootItems = [];
      this.changeEmitter.fire();
      return;
    }

    const filePath = document.uri.fsPath;
    const { referencesTo, referencedBy } = this.createReferenceItems(filePath, references);
    const referenceGroups = [
      this.createGroup('Referenced by >', referencedBy, filePath, 0, 'arrow-up-left'),
      this.createGroup('References >', referencesTo, filePath, 0, 'arrow-down-right'),
    ];
    const sections = buildYamlStructure(document.getText(), options)
      .map((node) => this.createStructureItem(node, filePath));
    this.rootItems = [...referenceGroups, ...sections];
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private createReferenceItems(
    activePath: string,
    references: TemplateReference[]
  ): { referencesTo: YamlStructureItem[]; referencedBy: YamlStructureItem[] } {
    const normalizedActivePath = this.normalizePath(activePath);
    const referencesTo: YamlStructureItem[] = [];
    const referencedBy: YamlStructureItem[] = [];
    const seen = new Set<string>();

    for (const reference of references) {
      const sourceIsActive = this.normalizePath(reference.sourceFile) === normalizedActivePath;
      const targetIsActive = this.normalizePath(reference.path) === normalizedActivePath;
      if (!sourceIsActive && !targetIsActive) {
        continue;
      }

      const targetPath = sourceIsActive ? reference.path : reference.sourceFile;
      if (this.normalizePath(targetPath) === normalizedActivePath) {
        continue;
      }
      const id = `${sourceIsActive ? 'outgoing' : 'incoming'}:${this.normalizePath(targetPath)}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);

      const label = referenceDisplayPath(activePath, targetPath);
      const item = new YamlStructureItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        targetPath,
        0
      );
      item.id = id;
      item.iconPath = new vscode.ThemeIcon('file');
      item.command = {
        command: 'adoInspector.navigateToYamlElement',
        title: 'Open related YAML file',
        arguments: [item],
      };
      (sourceIsActive ? referencesTo : referencedBy).push(item);
    }

    return { referencesTo, referencedBy };
  }

  private createGroup(
    label: string,
    children: YamlStructureItem[],
    filePath: string,
    offset: number,
    icon: string
  ): YamlStructureItem {
    const item = new YamlStructureItem(
      label,
      this.getCollapsibleState(children),
      filePath,
      offset
    );
    item.children = children;
    for (const child of children) {
      child.parent = item;
    }
    item.id = `group:${label}`;
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }

  private createStructureItem(
    node: YamlStructureNode,
    filePath: string,
    parent?: YamlStructureItem
  ): YamlStructureItem {
    const item = new YamlStructureItem(
      node.label,
      node.children.length > 0
        ? this.allExpanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      filePath,
      node.offset
    );
    item.parent = parent;
    item.children = node.children.map((child) => this.createStructureItem(child, filePath, item));
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon(
      node.icon ?? (item.children.length ? 'symbol-structure' : 'symbol-field'),
      node.iconColor ? new vscode.ThemeColor(node.iconColor) : undefined
    );
    item.command = {
      command: 'adoInspector.navigateToYamlElement',
      title: 'Go to YAML element',
      arguments: [item],
    };
    return item;
  }

  private async revealExpandedItems(
    treeView: vscode.TreeView<YamlStructureItem>,
    item: YamlStructureItem
  ): Promise<void> {
    if (item.children.length === 0) {
      return;
    }
    await treeView.reveal(item, { expand: true, select: false, focus: false });
    for (const child of item.children) {
      await this.revealExpandedItems(treeView, child);
    }
  }

  private getCollapsibleState(
    children: YamlStructureItem[]
  ): vscode.TreeItemCollapsibleState {
    if (children.length === 0) {
      return vscode.TreeItemCollapsibleState.None;
    }
    return this.allExpanded
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed;
  }

  private updateExpansionState(items: YamlStructureItem[], expanded: boolean): void {
    for (const item of items) {
      item.collapsibleState = item.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : expanded
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
      this.updateExpansionState(item.children, expanded);
    }
  }

  private normalizePath(filePath: string): string {
    const normalizedPath = vscode.Uri.file(filePath).fsPath;
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
  }
}
