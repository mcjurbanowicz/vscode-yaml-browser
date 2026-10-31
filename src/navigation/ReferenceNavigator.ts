import * as vscode from 'vscode';
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
      command: 'adoInspector.navigateToTemplate',
      title: 'Navigate to Template',
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
    this.updateBreadcrumbDisplay();
  }

  /**
   * Pop the last node from the navigation stack.
   */
  popNode(): TemplateTreeNode | null {
    return this.navigationStack.pop();
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
    const breadcrumbs = this.currentPath.map((path) => {
      const fileName = path.split('/').pop() || path;
      return `📄 ${fileName}`;
    });

    // Show full path if depth <= 3, otherwise collapse
    const displayLimit = 3;
    if (this.currentPath.length <= displayLimit) {
      this.panel.text = `🍞 Breadcrumb: ${breadcrumbs.join(' → ')} 🍞`;
    } else {
      // Collapse intermediate nodes
      const first = breadcrumbs[0];
      const last = breadcrumbs[breadcrumbs.length - 1];
      const middle = breadcrumbs.length - 2 > 0 ? ' ... ' : '';
      this.panel.text = `🍞 Breadcrumb: ${first} ${middle}${last} 🍞`;
    }

    this.panel.tooltip = `Click to navigate. Full path: ${breadcrumbs.join(' → ')}`;
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
    this.navigationStack = this.navigationStack.filter((n) => n.key !== node.key);
    this.pushNode(node);

    // Open the template
    await this.treeProvider.openTemplate(node);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  /**
   * Navigate to the parent template.
   */
  async navigateToParent(): Promise<void> {
    if (this.navigationStack.length === 0) {
      vscode.window.showWarningMessage('No parent to navigate to.');
      return;
    }

    const parent = this.navigationStack[this.navigationStack.length - 1];
    this.navigationStack.pop();

    // Open the parent
    await this.treeProvider.openTemplate(parent);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  /**
   * Navigate to a node in the tree.
   */
  async navigateToNode(node: TemplateTreeNode): Promise<void> {
    // Remove any deeper nodes from the stack
    this.navigationStack = this.navigationStack.filter((n) => n.key !== node.key);
    this.pushNode(node);

    // Open the template
    await this.treeProvider.openTemplate(node);

    // Update status bar
    this.updateBreadcrumbDisplay();
  }

  /**
   * Find a node by its path.
   */
  private findNodeByPath(path: string): TemplateTreeNode | null {
    if (!this.treeProvider.tree) {
      return null;
    }

    return this.findNodeRecursive(this.treeProvider.tree, path, 0);
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
