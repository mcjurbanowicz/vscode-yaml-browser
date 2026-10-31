import * as vscode from 'vscode';
import * as path from 'path';
import { TemplateTreeNode, TemplateExplorerProvider } from '../tree/TemplateExplorer';

/**
 * Provides navigation between template levels using collapsible breadcrumbs.
 */
export class ReferenceNavigator {
  private readonly treeProvider: TemplateExplorerProvider;
  private readonly panel: vscode.StatusBarItem;
  private currentPath: string[] = [];
  private navigationStack: TemplateTreeNode[] = [];

  constructor(treeProvider: TemplateExplorerProvider) {
    this.treeProvider = treeProvider;
    this.panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.panel.command = {
      command: 'adoInspector.selectBreadcrumb',
      title: 'Choose a template level',
    };
    this.panel.show();
  }

  /**
   * Set the current navigation path.
   */
  setNavigationPath(path: string[]): void {
    this.currentPath = path;
    this.updateBreadcrumbDisplay();
  }

  /**
   * Push a node onto the navigation stack.
   */
  pushNode(node: TemplateTreeNode): void {
    this.navigationStack.push(node);
    this.currentPath = this.navigationStack.map((entry) => entry.path);
    this.updateBreadcrumbDisplay();
  }

  /**
   * Pop the last node from the navigation stack.
   */
  popNode(): TemplateTreeNode | null {
    return this.navigationStack.pop() ?? null;
  }

  /**
   * Update the breadcrumb display in the status bar.
   */
  private updateBreadcrumbDisplay(): void {
    if (this.currentPath.length === 0) {
      this.panel.text = '';
      return;
    }

    // Build breadcrumb string
    const breadcrumbs = this.currentPath.map(
      (filePath) => `$(file) ${path.basename(filePath)}`
    );

    // Show full path if depth <= 3, otherwise collapse
    const displayLimit = 3;
    if (this.currentPath.length <= displayLimit) {
      this.panel.text = breadcrumbs.join(' $(chevron-right) ');
    } else {
      // Collapse intermediate nodes
      const first = breadcrumbs[0];
      const last = breadcrumbs[breadcrumbs.length - 1];
      this.panel.text = `${first} $(ellipsis) ${last}`;
    }

    this.panel.tooltip = `Choose a template level: ${breadcrumbs.join(' > ')}`;
  }

  /**
   * Navigate to a specific template.
   */
  async navigateTo(templatePath: string): Promise<void> {
    // Find the node in the tree
    const node = this.findNodeByPath(templatePath);
    if (!node) {
      vscode.window.showErrorMessage(`Template not found: ${templatePath}`);
      return;
    }

    // Update navigation stack
    this.setCurrentNode(node);

    // Open the template
    await this.treeProvider.openTemplate(node);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  async showBreadcrumbPicker(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      this.navigationStack.map((node, index) => ({
        label: `$(file) ${node.label}`,
        description: node.path,
        node,
        index,
      })),
      { placeHolder: 'Navigate to a template level' }
    );
    if (!selected) {
      return;
    }

    this.navigationStack = this.navigationStack.slice(0, selected.index + 1);
    this.currentPath = this.navigationStack.map((node) => node.path);
    await this.treeProvider.openTemplate(selected.node);
    this.updateBreadcrumbDisplay();
  }

  setActivePath(filePath: string): void {
    const node = this.findNodeByPath(filePath);
    if (node) {
      this.setCurrentNode(node);
    } else {
      this.clear();
    }
  }

  dispose(): void {
    this.panel.dispose();
  }

  private setCurrentNode(node: TemplateTreeNode): void {
    const ancestry: TemplateTreeNode[] = [];
    for (let current: TemplateTreeNode | null = node; current; current = current.parent) {
      ancestry.push(current);
    }
    this.navigationStack = ancestry.reverse();
    this.currentPath = this.navigationStack.map((entry) => entry.path);
    this.updateBreadcrumbDisplay();
  }

  /**
   * Navigate to the parent template.
   */
  async navigateToParent(): Promise<void> {
    if (this.navigationStack.length < 2) {
      vscode.window.showWarningMessage('No parent to navigate to.');
      return;
    }

    this.navigationStack.pop();
    const parent = this.navigationStack[this.navigationStack.length - 1];
    this.currentPath = this.navigationStack.map((node) => node.path);

    // Open the parent
    await this.treeProvider.openTemplate(parent);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  /**
   * Navigate to a node in the tree.
   */
  async navigateToNode(node: TemplateTreeNode): Promise<void> {
    this.setCurrentNode(node);

    // Open the template
    await this.treeProvider.openTemplate(node);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  /**
   * Find a node by its path.
   */
  private findNodeByPath(path: string): TemplateTreeNode | null {
    if (!this.treeProvider.rootNode) {
      return null;
    }

    return this.findNodeRecursive(this.treeProvider.rootNode, path, 0);
  }

  /**
   * Recursively find a node by path.
   */
  private findNodeRecursive(
    node: TemplateTreeNode,
    targetPath: string,
    currentDepth: number
  ): TemplateTreeNode | null {
    if (node.path === targetPath) {
      return node;
    }

    for (const child of node.children) {
      const found = this.findNodeRecursive(child, targetPath, currentDepth + 1);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * Get the current navigation stack as an array.
   */
  getNavigationStack(): TemplateTreeNode[] {
    return [...this.navigationStack];
  }

  /**
   * Clear the navigation stack.
   */
  clear(): void {
    this.navigationStack = [];
    this.currentPath = [];
    this.updateBreadcrumbDisplay();
  }
}
