import * as vscode from 'vscode';
import { TemplateReferenceTree, TemplateNode } from '../types/templateReference';

/**
 * Provides a tree view of resolved template references.
 */
export class TemplateExplorerProvider implements vscode.TreeDataProvider<TemplateTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TemplateTreeNode | undefined | null | void> =
    new vscode.EventEmitter<TemplateTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TemplateTreeNode | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private tree: TemplateTreeNode | null = null;
  private expandedNodes = new Set<string>();

  constructor() {
    // Initial refresh
    this.refresh();
  }

  /**
   * Refresh the tree.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Set the tree data.
   */
  setTree(tree: TemplateReferenceTree | null): void {
    this.tree = tree ? this.createNode(tree.tree, null) : null;
    this.expandedNodes.clear();
    this._onDidChangeTreeData.fire();
  }

  get rootNode(): TemplateTreeNode | null {
    return this.tree;
  }

  /**
   * Get the child elements of a tree item.
   */
  getTreeItem(element: TemplateTreeNode): vscode.TreeItem {
    const collapsibleState = element.children.length
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.label, collapsibleState);
    item.tooltip = element.tooltip;
    item.contextValue = element.contextValue;
    item.iconPath = new vscode.ThemeIcon(element.iconPath);
    item.resourceUri = vscode.Uri.file(element.path);
    item.command = {
      command: 'adoInspector.navigateToTemplate',
      title: `Navigate to ${element.label}`,
      arguments: [element],
    };
    return item;
  }

  /**
   * Get children of a tree item.
   */
  getChildren(element?: TemplateTreeNode): Thenable<TemplateTreeNode[]> {
    if (!this.tree) {
      return Promise.resolve([]);
    }

    if (element === undefined) {
      return Promise.resolve([this.tree]);
    }

    return Promise.resolve(element.children);
  }

  /**
   * Get the parent of a tree item.
   */
  getParent(element: TemplateTreeNode): TemplateTreeNode | null {
    return element.parent;
  }

  /**
   * Toggle expansion of a node.
   */
  toggleExpansion(node: TemplateTreeNode): void {
    const key = node.key;
    if (this.expandedNodes.has(key)) {
      this.expandedNodes.delete(key);
    } else {
      this.expandedNodes.add(key);
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Open a template in a new editor tab.
   */
  async openTemplate(node: TemplateTreeNode): Promise<void> {
    const uri = vscode.Uri.file(node.path);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  private createNode(node: TemplateNode, parent: TemplateTreeNode | null): TemplateTreeNode {
    const children = node.children.map((child) => this.createNode(child, null));
    const treeNode = new TemplateTreeNode(
      node.path,
      node.path.split(/[\\/]/).pop() || node.path,
      node.path,
      'file',
      node.isRoot ? 'pipeline' : 'template',
      children.length === 0,
      children,
      node.depth,
      node.parameters ? JSON.stringify(node.parameters) : '',
      parent
    );
    for (const child of children) {
      child.parent = treeNode;
    }
    return treeNode;
  }
}

/**
 * A node in the template tree.
 */
export class TemplateTreeNode {
  public readonly path: string;
  public readonly label: string;
  public readonly tooltip: string;
  public readonly iconPath: string;
  public readonly contextValue: string;
  public readonly isLeaf: boolean;
  public readonly children: TemplateTreeNode[];
  public readonly depth: number;
  public readonly parameters: string;
  public readonly key: string;
  public parent: TemplateTreeNode | null = null;

  constructor(
    path: string,
    label: string,
    tooltip: string,
    iconPath: string,
    contextValue: string,
    isLeaf: boolean,
    children: TemplateTreeNode[] = [],
    depth: number = 0,
    parameters: string = '',
    parent: TemplateTreeNode | null = null
  ) {
    this.path = path;
    this.label = label;
    this.tooltip = tooltip;
    this.iconPath = iconPath;
    this.contextValue = contextValue;
    this.isLeaf = isLeaf;
    this.children = children;
    this.depth = depth;
    this.parameters = parameters;
    this.key = `${path}|${depth}`;
    this.parent = parent;
  }
}
