import * as path from 'path';
import * as vscode from 'vscode';
import { TemplateReference } from '../types/templateReference';
import { YamlStructureOptions, YamlStructureNode, buildYamlStructure } from './YamlStructure';

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
    const referenceItems = this.createReferenceItems(filePath, references);
    const referenceGroup = this.createGroup('Template references >', referenceItems, filePath, 0);
    const sections = buildYamlStructure(document.getText(), options)
      .map((node) => this.createStructureItem(node, filePath));
    this.rootItems = [referenceGroup, ...sections];
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private createReferenceItems(
    activePath: string,
    references: TemplateReference[]
  ): YamlStructureItem[] {
    const normalizedActivePath = this.normalizePath(activePath);
    const items: YamlStructureItem[] = [];
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

      const direction = sourceIsActive ? 'References' : 'Referenced by';
      const label = `${direction} > ${path.basename(targetPath)}`;
      const item = new YamlStructureItem(
        label,
        vscode.TreeItemCollapsibleState.None,
        targetPath,
        0,
        targetPath
      );
      item.id = id;
      item.iconPath = new vscode.ThemeIcon('file');
      item.command = {
        command: 'adoInspector.navigateToYamlElement',
        title: 'Open referenced YAML file',
        arguments: [item],
      };
      items.push(item);
    }

    return items;
  }

  private createGroup(
    label: string,
    children: YamlStructureItem[],
    filePath: string,
    offset: number
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
    item.iconPath = new vscode.ThemeIcon('references');
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
    item.iconPath = new vscode.ThemeIcon(children.length ? 'symbol-structure' : 'symbol-field');
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
