import * as vscode from 'vscode';
import { ADOYAMLInspectorExtension } from '../extension';

/**
 * Webview view provider for the YAML Inspector Panel.
 * Displays:
 * - Template tree
 * - Validation diagnostics
 * - Breadcrumb navigation
 */
export class YamlInspectorPanelProvider implements vscode.WebviewViewProvider {
  private readonly extension: ADOYAMLInspectorExtension;
  private readonly viewType = 'adoInspectorPanel';

  constructor(extension: ADOYAMLInspectorExtension) {
    this.extension = extension;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(
          vscode.Uri.file(__dirname.replace(/\\/g, '/').replace('/src/', '/out/src/')),
          'assets'
        ),
      ],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'expandNode':
            this.handleExpandNode(message);
            break;
          case 'collapseNode':
            this.handleCollapseNode(message);
            break;
          case 'navigate':
            await this.handleNavigate(message);
            break;
        }
      },
      undefined,
      this.extension.disposables
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const getUri = (path: string): vscode.Uri =>
      webview.asWebviewUri(vscode.Uri.joinPath(webview.baseUri, path));

    return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Azure DevOps YAML Inspector</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      color: #ccc9c3;
      background-color: #1e1e1e;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background-color: #2d2d2d;
      padding: 8px 12px;
      border-bottom: 1px solid #3e3e42;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-title {
      font-weight: 600;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-title .icon {
      font-size: 16px;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .header-btn {
      background-color: #094771;
      color: #ffffff;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .header-btn:hover {
      background-color: #1155cc;
    }

    .header-btn:active {
      background-color: #003366;
    }

    /* Breadcrumb */
    .breadcrumb {
      background-color: #252526;
      padding: 4px 12px;
      border-bottom: 1px solid #3e3e42;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      white-space: nowrap;
    }

    .breadcrumb .crumb {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      background-color: #37373d;
      color: #cccccc;
      font-size: 11px;
      user-select: none;
    }

    .breadcrumb .crumb:hover {
      background-color: #094771;
    }

    .breadcrumb .crumb .icon {
      font-size: 12px;
    }

    .breadcrumb .separator {
      color: #858585;
      font-size: 9px;
    }

    /* Main content */
    .main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Tabs */
    .tabs {
      background-color: #252526;
      border-bottom: 1px solid #3e3e42;
      display: flex;
    }

    .tab {
      padding: 6px 12px;
      background-color: #2d2d2d;
      border: none;
      border-right: 1px solid #3e3e42;
      color: #858585;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    }

    .tab:hover {
      background-color: #2a2d2e;
    }

    .tab.active {
      background-color: #1e1e1e;
      color: #cccccc;
      border-top: 2px solid #094771;
    }

    .tab .icon {
      font-size: 12px;
    }

    /* Panel content */
    .panel-content {
      flex: 1;
      overflow: auto;
      background-color: #1e1e1e;
    }

    .panel-section {
      padding: 8px 12px;
      border-bottom: 1px solid #3e3e42;
    }

    .panel-section-title {
      font-size: 11px;
      font-weight: 600;
      color: #858585;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    /* Tree view */
    .tree-view {
      background-color: #1e1e1e;
    }

    .tree-item {
      display: flex;
      align-items: center;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 12px;
      color: #cccccc;
    }

    .tree-item:hover {
      background-color: #2a2d2e;
    }

    .tree-item .indent {
      width: 16px;
      display: inline-block;
    }

    .tree-item .icon {
      margin-right: 6px;
      font-size: 13px;
    }

    .tree-item .name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tree-item .depth {
      color: #858585;
      font-size: 10px;
      margin-left: 4px;
    }

    /* Status */
    .status-bar {
      background-color: #007acc;
      color: #ffffff;
      padding: 4px 12px;
      font-size: 11px;
      display: flex;
      justify-content: space-between;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Messages */
    .message {
      padding: 12px;
      font-size: 11px;
      text-align: center;
      color: #858585;
    }

    .message.empty {
      padding: 40px 12px;
    }

    /* Error list */
    .error-list {
      font-size: 11px;
    }

    .error-item {
      padding: 4px 8px;
      border-bottom: 1px solid #3e3e42;
      font-size: 11px;
    }

    .error-item .severity {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
      font-size: 9px;
      line-height: 8px;
      text-align: center;
    }

    .error-item .severity.error {
      background-color: #f14c4c;
      color: #ffffff;
    }

    .error-item .severity.warning {
      background-color: #dcb67a;
      color: #1e1e1e;
    }

    .error-item .severity.info {
      background-color: #4ec9b0;
      color: #1e1e1e;
    }

    .error-item .code {
      color: #858585;
      font-size: 9px;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-title">
      <span class="icon">🔍</span>
      Azure DevOps YAML Inspector
    </div>
    <div class="header-actions">
      <button class="header-btn" onclick="window.extension.scanTemplates()">
        🔄 Scan
      </button>
      <button class="header-btn" onclick="window.extension.clearCache()">
        🗑️ Clear Cache
      </button>
    </div>
  </div>

  <div class="breadcrumb" id="breadcrumb">
    <span style="color: #858585; font-size: 11px;">No templates found</span>
  </div>

  <div class="main">
    <div class="tabs">
      <button class="tab active">
        <span class="icon">🌳</span>
        Template Tree
      </button>
      <button class="tab">
        <span class="icon">⚠️</span>
        Validation
      </button>
    </div>

    <div class="panel-content">
      <div class="panel-section">
        <div class="panel-section-title">Template References</div>
        <div id="tree-view" class="tree-view"></div>
      </div>
      <div class="panel-section">
        <div class="panel-section-title">Validation Diagnostics</div>
        <div id="diagnostics-view" class="error-list"></div>
      </div>
    </div>
  </div>

  <div class="status-bar">
    <div class="status-item">
      <span>Files scanned: <strong id="file-count">0</strong></span>
    </div>
    <div class="status-item">
      <span>Cache: <strong id="cache-size">0</strong> entries</span>
    </div>
  </div>

  <script>
    window.extension = {
      async scanTemplates() {
        window.postMessage({ command: 'scanTemplates' }, '*');
      },
      async clearCache() {
        window.postMessage({ command: 'clearCache' }, '*');
      },
    };

    window.addEventListener('message', async (event) => {
      const { command, data } = event.data;

      switch (command) {
        case 'scanTemplates':
          await scanTemplates();
          break;
        case 'clearCache':
          await clearCache();
          break;
        case 'updateTree':
          updateTree(data);
          break;
        case 'updateDiagnostics':
          updateDiagnostics(data);
          break;
        case 'updateStats':
          updateStats(data);
          break;
      }
    });

    async function scanTemplates() {
      document.getElementById('tree-view').innerHTML = '<div class="message">Scanning...</div>';
      document.getElementById('diagnostics-view').innerHTML = '<div class="message">Scanning...</div>';

      try {
        const response = await fetch('webview://ado-inspector/scan');
        const result = await response.json();
        updateTree(result.tree);
        updateDiagnostics(result.errors);
        updateStats(result.stats);
      } catch (error) {
        document.getElementById('tree-view').innerHTML = '<div class="message empty">No templates found. Configure scanRoot in settings.</div>';
      }
    }

    async function clearCache() {
      const response = await fetch('webview://ado-inspector/clearCache');
      const result = await response.json();
      updateStats(result.stats);
    }

    function updateTree(tree) {
      const container = document.getElementById('tree-view');

      if (!tree || !tree.tree) {
        container.innerHTML = '<div class="message empty">No templates found.</div>';
        return;
      }

      const root = tree.tree;

      function renderNode(node, depth = 0) {
        const indent = ' '.repeat(depth * 20);
        const hasChildren = node.children && node.children.length > 0;
        const nodeHtml = document.createElement('div');
        nodeHtml.className = 'tree-item';
        nodeHtml.innerHTML = \`
          <span class="indent"></span>
          <span class="icon">📄</span>
          <span class="name" title="\${node.path}" onclick="window.extension.navigateToNode('\${encodeURIComponent(node.path)}')">\${node.path.split('/').pop()}</span>
          <span class="depth">Level \${node.depth}</span>
        \`;

        if (hasChildren) {
          nodeHtml.onclick = (e) => {
            e.stopPropagation();
            window.extension.toggleNode(node.path);
          };
        }

        if (node.children && node.children.length > 0) {
          const childrenContainer = document.createElement('div');
          childrenContainer.style.display = 'block';
          node.children.forEach((child) => {
            childrenContainer.appendChild(renderNode(child, depth + 1));
          });
          nodeHtml.appendChild(childrenContainer);
        }

        return nodeHtml;
      }

      container.innerHTML = '';
      container.appendChild(renderNode(root));
    }

    function updateDiagnostics(errors) {
      const container = document.getElementById('diagnostics-view');

      if (!errors || errors.length === 0) {
        container.innerHTML = '<div class="message">No validation errors.</div>';
        return;
      }

      container.innerHTML = '';
      errors.forEach((error) => {
        const item = document.createElement('div');
        item.className = 'error-item';
        item.innerHTML = \`
          <span class="severity \${error.severity}">
            \${error.severity === 'error' ? '✗' : error.severity === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span>\${error.message}</span>
          <span class="code">\${error.code}</span>
        \`;
        container.appendChild(item);
      });
    }

    function updateStats(stats) {
      document.getElementById('file-count').textContent = stats.filesScanned || 0;
      document.getElementById('cache-size').textContent = stats.cacheSize || 0;
    }
  </script>
</body>
</html>`;
  }

  private handleExpandNode(message: { nodePath: string }): void {
    console.log('Expand node:', message.nodePath);
  }

  private handleCollapseNode(message: { nodePath: string }): void {
    console.log('Collapse node:', message.nodePath);
  }

  private async handleNavigate(message: { templatePath: string }): Promise<void> {
    console.log('Navigate to:', message.templatePath);
  }
}
