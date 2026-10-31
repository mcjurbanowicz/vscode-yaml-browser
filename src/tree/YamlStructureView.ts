import * as vscode from 'vscode';
import { TemplateReference } from '../types/templateReference';
import { YamlStructureOptions, YamlStructureNode, buildYamlStructure } from './YamlStructure';
import { referenceDisplayPath } from './referencePath';

export class YamlStructureItem extends vscode.TreeItem {
  children: YamlStructureItem[] = [];

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

  getTreeItem(element: YamlStructureItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: YamlStructureItem): YamlStructureItem[] {
    return element?.children ?? this.rootItems;
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
      children.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
      filePath,
      offset
    );
    item.children = children;
    item.id = `group:${label}`;
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }

  private createStructureItem(node: YamlStructureNode, filePath: string): YamlStructureItem {
    const children = node.children.map((child) => this.createStructureItem(child, filePath));
    const item = new YamlStructureItem(
      node.label,
      children.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
      filePath,
      node.offset
    );
    item.children = children;
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon(
      node.icon ?? (children.length ? 'symbol-structure' : 'symbol-field'),
      node.iconColor ? new vscode.ThemeColor(node.iconColor) : undefined
    );
    item.command = {
      command: 'adoInspector.navigateToYamlElement',
      title: 'Go to YAML element',
      arguments: [item],
    };
    return item;
  }

  private normalizePath(filePath: string): string {
    const normalizedPath = vscode.Uri.file(filePath).fsPath;
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
  }
}
