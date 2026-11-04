# VS Code Extension Development Guide

> A complete guide to building, testing, and publishing VS Code extensions from scratch.

## Table of Contents

1. [Why Build a VS Code Extension?](#why-build-a-vs-code-extension)
2. [Prerequisites](#prerequisites)
3. [Scaffolding Your Extension](#scaffolding-your-extension)
4. [Understanding `package.json`](#understanding-packagejson)
5. [Implementing Core Features](#implementing-core-features)
6. [Commands, Keybindings, and TreeViews](#commands-keybindings-and-treeviews)
7. [Rich Webview Panels](#rich-webview-panels)
8. [Testing](#testing)
9. [Continuous Integration](#continuous-integration)
10. [Packaging and Publishing](#packaging-and-publishing)
11. [Pro Tips & Best Practices](#pro-tips--best-practices)

---

## Why Build a VS Code Extension? 🌟

Visual Studio Code is more than an editor—it's a playground for developers. With over 50,000 extensions on the Marketplace, the community loves customizing their experience. But have you ever thought, *"Hey, I could add that feature myself!"*?

By building your own extension, you:
- **Learn deeply** about VS Code's API and architecture
- **Solve your own problems** by implementing custom tools
- **Share with the community** and contribute to the ecosystem
- **Gain full control** over your editor experience

By the end of this guide, you'll have:
- ✅ A fully functional "Hello World" extension with actionable commands
- ✅ A custom **TreeView** sidebar
- ✅ A **Webview panel** for rich UIs
- ✅ Automated **unit & integration tests** using Mocha
- ✅ CI setup in **GitHub Actions**
- ✅ Knowledge of packaging, publishing, and maintaining your extension

---

## Prerequisites: Your Toolkit 🛠️

Before you begin, ensure you have the following installed:

| Tool | Purpose | Install Command |
|------|---------|-----------------|
| **Node.js (v14+)** | JavaScript runtime engine | [nodejs.org](https://nodejs.org/) |
| **npm or Yarn** | Package manager | `npm -v` or `yarn -v` |
| **Visual Studio Code** | The IDE you'll be extending | [code.visualstudio.com](https://code.visualstudio.com/) |
| **Yeoman & Generator Code** | Extension scaffolding | `npm install -g yo generator-code` |
| **vsce** | Extension packaging/publishing CLI | `npm install -g vsce` |

```bash
# Install global dependencies
npm install -g yo generator-code vsce

# OR with yarn
yarn global add yo generator-code vsce
```

> 💡 **Pro Tip:** Use [`nvm`](https://github.com/nvm-sh/nvm) to manage Node versions per project. This lets you switch between Node 14, 16, 18, etc., without conflicts.

---

## Scaffolding Your Extension 🔧

Yeoman generates boilerplate code that gives you a head start.

### Creating the Extension

```bash
yo code
```

You'll be prompted with:

```
? Choose the type of extension you want to create:
  1) TypeScript
  2) JavaScript
? Extension Name: my-first-extension
? Extension Identifier: myFirstExtension
? Description: A simple extension that says hello
? Initialize this extension with git? Yes
```

### Generated Project Structure

```
my-first-extension/
├── .vscode/
│   └── launch.json          # Debug configurations
├── src/
│   └── extension.ts         # Main extension entry point
├── test/
│   └── extension.test.ts    # Mocha test file
├── test/
│   └── suite/
│       └── index.ts         # Test suite runner
├── .vscode-test/
│   └── fixtures/            # Test workspace
├── .vscode-test.config.json # Test configuration
├── .eslintrc.json          # ESLint config
├── .vscodeignore           # Files to exclude from packaging
├── .editorconfig           # Editor settings
├── .gitignore
├── package.json            # Extension manifest
├── tsconfig.json           # TypeScript config
├── README.md               # Project documentation
├── CHANGELOG.md            # Version history
└── LICENSE
```

### Key Files Explained

| File | Purpose |
|------|---------|
| `package.json` | Extension manifest, contributions, activation events |
| `src/extension.ts` | Main entry point — activates the extension |
| `test/extension.test.ts` | Unit tests for your extension |
| `.eslintrc.json` | Linting rules for code quality |
| `.vscodeignore` | Patterns to exclude when packaging (e.g. `**/*.ts`) |

---

## Understanding `package.json` 📋

The `package.json` is the heart of your extension. It defines **what** your extension does and **how** VS Code should activate it.

### Complete Example

```json
{
  "name": "my-first-extension",
  "displayName": "My First Extension",
  "description": "Says hello, shows a TreeView, and creates a Webview panel!",
  "version": "0.0.1",
  "publisher": "mycompany",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": [
    "Other",
    "Programming Languages"
  ],
  "activationEvents": [
    "onCommand:extension.sayHello",
    "onView:myTreeView",
    "onLanguage:typescript"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "extension.sayHello",
        "title": "Hello World"
      },
      {
        "command": "extension.showWebview",
        "title": "Show Webview",
        "icon": "$(view-compact)"
      }
    ],
    "keybindings": [
      {
        "command": "extension.sayHello",
        "key": "ctrl+alt+h",
        "when": "editorTextFocus"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "myTreeView",
          "name": "My Custom View"
        }
      ]
    },
    "configuration": {
      "type": "object",
      "title": "My Extension",
      "properties": {
        "myExtension.showWelcome": {
          "type": "boolean",
          "default": true,
          "description": "Show welcome message on activation",
          "scope": "window"
        },
        "myExtension.greetingText": {
          "type": "string",
          "default": "Hello, World!",
          "description": "Custom greeting text",
          "scope": "resource"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.0",
    "@types/node": "18.x",
    "@types/vscode": "^1.75.0",
    "@types/vscode-webview": "^1.57.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-import": "^2.25.0",
    "eslint-plugin-no-null": "^1.0.2",
    "eslint-plugin-prefer-arrow": "^1.2.3",
    "mocha": "^10.0.0",
    "minimist": "^1.2.6",
    "vsce": "^2.15.0",
    "vscode-test": "^1.6.0"
  },
  "dependencies": {}
}
```

### Key Manifest Fields Explained

| Field | Description |
|-------|-------------|
| `activationEvents` | Triggers extension activation (lazy loading) |
| `contributes.commands` | Registers commands in the Command Palette |
| `contributes.keybindings` | Maps commands to keyboard shortcuts |
| `contributes.views` | Registers sidebar panels (TreeViews) |
| `contributes.configuration` | Exposes settings in VS Code Settings UI |
| `categories` | Marketplace category for discoverability |
| `engines.vscode` | Minimum VS Code version required |

### Activation Events Strategy

Choose activation events carefully — they determine **when** your extension loads:

```json
"activationEvents": [
  "onCommand:extension.sayHello",    // Activates on first command use
  "onView:myTreeView",               // Activates when TreeView is opened
  "onLanguage:typescript",           // Activates when TS file is opened
  "onLanguage:javascript",           // Activates when JS file is opened
  "onStartupFinished",               // Activates when VS Code starts (expensive!)
  ""                                 // Activates immediately on startup
]
```

> ⚠️ **Best Practice:** Use `onCommand` or `onLanguage` events for lazy activation. Avoid `onStartupFinished` unless absolutely necessary, as it loads your extension even when the user is just opening a file.

---

## Implementing Core Features 🖋️

### 3.1 Hello World Command

**`src/extension.ts`**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 My Extension is now active!');

  const config = vscode.workspace.getConfiguration('myExtension');
  if (config.get<boolean>('showWelcome')) {
    vscode.window.showInformationMessage('Welcome to My First Extension! 🌟');
  }

  // Register the Hello World command
  const helloCommand = vscode.commands.registerCommand('extension.sayHello', () => {
    vscode.window.showInformationMessage('Hello, VS Code Extension! 🎉');
  });

  // Command with multiple choices
  const choiceCommand = vscode.commands.registerCommand('extension.showChoice', () => {
    vscode.window
      .showInformationMessage(
        'Hello, VS Code Extension!',
        '🎉 Celebrate',
        '📖 Docs',
        '🚀 Learn More'
      )
      .then((selection) => {
        if (selection === '📖 Docs') {
          vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api'));
        } else if (selection === '🚀 Learn More') {
          vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api/extension-authoring'));
        }
      });
  });

  context.subscriptions.push(helloCommand, choiceCommand);
}

export function deactivate() {}
```

**What's happening:**
- `registerCommand()` registers a handler for a command ID
- `context.subscriptions.push()` ensures cleanup on extension deactivation
- `vscode.commands` is a singleton that manages all registered commands

---

### 3.2 Custom TreeView

**`src/treeProvider.ts`**

```typescript
import * as vscode from 'vscode';

export class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MyTreeItem | void | null | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Called when the tree structure changes
  getChildren(element?: MyTreeItem): Thenable<MyTreeItem[]> {
    if (element) {
      // Get children of a specific node
      return Promise.resolve([
        new MyTreeItem('Child Item 1', element),
        new MyTreeItem('Child Item 2', element),
      ]);
    }

    // Get root items
    return Promise.resolve([
      new MyTreeItem('Item One'),
      new MyTreeItem('Item Two'),
      new MyTreeItem('Item Three'),
    ]);
  }

  // Called to get the display of a tree item
  getTreeItem(element: MyTreeItem): vscode.TreeItem {
    return element;
  }

  // Called when the user expands/collapses a node
  getChildren(element?: MyTreeItem): vscode.TreeItem[] {
    const children: vscode.TreeItem[] = [];
    if (element) {
      children.push(
        new MyTreeItem('Child 1', element, { command: 'extension.actionChild1' }),
        new MyTreeItem('Child 2', element, { command: 'extension.actionChild2' })
      );
    } else {
      children.push(
        new MyTreeItem('Root 1'),
        new MyTreeItem('Root 2')
      );
    }
    return children;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class MyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly parent?: MyTreeItem,
    iconPath?: { light: vscode.Uri; dark: vscode.Uri }
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);

    if (iconPath) {
      this.iconPath = iconPath;
    } else {
      this.iconPath = new vscode.ThemeIcon('file');
    }

    this.tooltip = `Tooltip for ${this.label}`;
    this.contextValue = 'myTreeItem';

    if (this.parent) {
      this.tooltip = `${this.label} (child of ${this.parent.label})`;
    }
  }
}
```

**Registering the TreeView in `package.json`:**

```json
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "myExtensionPanel",
          "title": "My Extension",
          "icon": "$(debug-icon)"
        }
      ]
    },
    "views": {
      "myExtensionPanel": [
        {
          "type": "tree",
          "id": "myTreeView",
          "name": "My Custom Tree View",
          "icon": "$(debug-icon)"
        }
      ]
    }
  }
}
```

**Registering in `extension.ts`:**

```typescript
const treeDataProvider = new MyTreeDataProvider();
const treeView = vscode.window.createTreeView('myTreeView', {
  treeDataProvider,
});

// Refresh when a file is opened/modified
vscode.workspace.onDidOpenTextDocument(() => treeView.refresh());
vscode.workspace.onDidChangeTextDocument(() => treeView.refresh());

context.subscriptions.push(treeView);
```

> 💡 **Pro Tip:** TreeViews can be slow if they render thousands of items. Consider using `TreeItem` with `showParentProcess` for performance, or use a `DataTransfer` for bulk operations.

---

### 3.3 Rich Webview Panel

**`src/webview.ts`**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';

export function createWebviewPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'myWebview',
    'My Webview Panel',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );

  // Set the initial content
  panel.webview.html = getWebviewContent(panel.webview);

  // Listen for messages from the webview
  panel.webview.onDidReceiveMessage(
    (message) => handleMessageFromWebview(message, panel),
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(webview: vscode.Webview): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>My Webview Panel</title>
      <style>
        body {
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          color: var(--vscode-editor-foreground);
          background-color: var(--vscode-editor-background);
          margin: 0;
          padding: 20px;
        }
        button {
          padding: 10px 20px;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        .message {
          margin-top: 20px;
          padding: 10px;
          border-radius: 4px;
          background-color: var(--vscode-input-background);
        }
      </style>
    </head>
    <body>
      <h1>Hello from Webview! 🎉</h1>
      <p>This is a rich webview panel created by your VS Code extension.</p>
      <button id="clickMeButton">Click Me!</button>
      <div id="messageArea" class="message"></div>
      <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('clickMeButton').addEventListener('click', () => {
          vscode.postMessage({
            command: 'alert',
            text: 'Button clicked! The webview can communicate with the extension.'
          });
        });

        // Listen for messages from the extension
        window.addEventListener('message', (event) => {
          const message = event.data;
          if (message.command === 'updateContent') {
            document.body.innerHTML = message.html;
          }
        });
      </script>
    </body>
    </html>
  `;
}

function handleMessageFromWebview(
  message: { command: string; text?: string; data?: any },
  panel: vscode.WebviewPanel
) {
  if (message.command === 'alert') {
    vscode.window.showInformationMessage(message.text || 'Message received!');
  } else if (message.command === 'updateContent') {
    panel.webview.html = message.html;
  }
}
```

**Registering the Webview command:**

```typescript
const webviewCommand = vscode.commands.registerCommand('extension.showWebview', () => {
  createWebviewPanel(context);
});

context.subscriptions.push(webviewCommand);
```

> 💡 **Pro Tip:** Webviews can be slow to load. Consider using `retainContextWhenHidden: true` to keep the webview in memory when collapsed, reducing load time when reopened.

---

## Testing 🧪

### Unit Tests with Mocha

**`test/extension.test.ts`**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import * as path from 'path';
import * as fs from 'fs';

suite('Extension Test Suite', () => {
  const extensionPath = path.resolve(__dirname, '../../');

  setup(() => {
    vscode.window.showInformationMessage('Start unit testing.');
  });

  teardown(() => {
    vscode.window.showInformationMessage('Done unit testing.');
  });

  suite('Extension activation', () => {
    test('Extension should activate', async () => {
      const ext = vscode.extensions.getExtension('mycompany.my-first-extension');
      assert.ok(ext, 'Extension should be registered');

      await activate(ext!.extensionContext);
      assert.ok(ext!.isActive, 'Extension should be active');
    });

    test('Hello command should be registered', async () => {
      const ext = vscode.extensions.getExtension('mycompany.my-first-extension');
      await activate(ext!.extensionContext);

      const helloCommand = vscode.commands.getCommand('extension.sayHello');
      assert.ok(helloCommand, 'Hello command should be registered');

      await helloCommand.execute();
    });

    test('TreeView should be created', async () => {
      const ext = vscode.extensions.getExtension('mycompany.my-first-extension');
      await activate(ext!.extensionContext);

      const treeView = vscode.window.registerTreeDataProvider('myTreeView', {});
      assert.ok(treeView, 'TreeView should be registered');
    });
  });
});
```

**Running Tests:**

```bash
npm test
```

### Integration Tests with `vscode-test`

**`test/runTest.js`**

```javascript
const path = require('path');

const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    // Download the VS Code executable
    const version = '1.75.0';
    const downloadUrl = `https://code-web-tests.storage.googleapis.com/${version}/code-${version}-x64-stable.exe`;

    // Create a test workspace
    const testWorkspace = path.join(__dirname, 'fixtures', 'test-workspace');
    fs.mkdirSync(testWorkspace, { recursive: true });

    // Copy fixtures to the test workspace
    fs.cpSync(path.join(__dirname, 'fixtures'), testWorkspace, { recursive: true });

    // Run the tests
    await runTests({
      version,
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, 'suite/index'),
      extensionTestsEnv: {
        VS_CODE_TESTS_FORCE_ENABLE_DIFF: '1',
      },
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
```

### Test Structure

```
test/
├── extension.test.ts       # Unit tests
├── suite/
│   └── index.ts            # Test runner setup
└── fixtures/               # Test workspace files
    └── test-workspace/
        └── .vscode/
            └── settings.json
```

### Best Practices for Testing

| Practice | Why It Matters |
|----------|---------------|
| Use `suite`/`test` over `describe`/`it` | Faster with Mocha |
| Use `suiteSetup`/`teardown` for expensive setup | Avoid redundant setup |
| Isolate tests | Each test should be independent |
| Use `suite.fixture` for shared fixtures | Reuse test data |
| Test the **extension**, not the **API** | Test behavior, not implementation |

---

## Continuous Integration 🤖

### GitHub Actions Workflow

**`.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  build-and-test:
    name: Build and Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compile TypeScript
        run: npm run compile

      - name: Lint
        run: npm run lint

      - name: Run unit tests
        run: npm run test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
          flags: unittests

      - name: Build extension
        run: vsce package

      - name: Upload extension artifact
        uses: actions/upload-artifact@v4
        with:
          name: extension-vsix
          path: my-first-extension-*.vsix
          retention-days: 7

  publish:
    name: Publish to Marketplace
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install vsce
        run: npm install -g vsce

      - name: Login to Marketplace
        run: vsce login ${{ secrets.VSCE_LOGIN }}

      - name: Publish extension
        run: vsce publish
        env:
          VSCE_LOGIN: ${{ secrets.VSCE_LOGIN }}

  release:
    name: Create Release
    needs: publish
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Create GitHub Release
        uses: actions/github-script@v7
        with:
          script: |
            const { readFileSync } = require('fs');
            const changelog = readFileSync('CHANGELOG.md', 'utf8');
            const { data: releases } = await github.rest.repos.listReleases({
              owner: context.repo.owner,
              repo: context.repo.repo
            });

            if (releases.length > 0) {
              const latest = releases[releases.length - 1];
              const tag = latest.tag_name;
              github.rest.repos.deleteRelease({
                owner: context.repo.owner,
                repo: context.repo.repo,
                release_id: latest.id
              });
            }

            const release = await github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: 'v' + require('../package.json').version,
              name: `Release v${require('../package.json').version}`,
              body: changelog,
              draft: false,
              prerelease: false
            });

            const artifact = await actions.downloadArtifact({
              name: 'extension-vsix',
              path: './dist',
              cleanup: true
            });

            await github.rest.repos.uploadReleaseAsset({
              owner: context.repo.owner,
              repo: context.repo.repo,
              release_id: release.data.id,
              name: 'my-first-extension-' + require('../package.json').version + '.vsix',
              data: fs.readFileSync('./dist/my-first-extension-' + require('../package.json').version + '.vsix')
            });
```

### CI Best Practices

| Practice | Why It Matters |
|----------|---------------|
| **Cache node_modules** | Reduces build time from 30s to 3s |
| **Upload artifacts** | Keep .vsix files for testing |
| **Publish only on main** | Prevents accidental marketplace overwrites |
| **Automate changelog** | Keep release notes up-to-date |
| **Run on PRs** | Catch regressions early |

---

## Packaging and Publishing 📦

### Packaging with `vsce`

```bash
# Package the extension
vsce package

# Package with specific version
vsce package -p 1.0.0

# Package with manifest file
vsce package --manifest package.json

# Package with custom output name
vsce package -o my-extension-1.0.0.vsix
```

### Publishing to the Marketplace

```bash
# Login
vsce login your-publisher-name

# Publish
vsce publish

# Publish with prerelease flag
vsce publish --pre

# Publish with manifest
vsce publish --manifest package.json
```

### `vsce` Manifest Configuration

```json
{
  "publisher": "mycompany",
  "displayName": "My First Extension",
  "description": "A useful extension for developers",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": ["Other", "Programming Languages"],
  "galleryBanner": {
    "color": "#1e8e3e",
    "theme": "dark"
  },
  "icon": "resources/icon.png",
  "activationEvents": ["onCommand:extension.sayHello"],
  "keywords": ["hello", "greeting", "vscode"],
  "license": "MIT",
  "licenseUri": "https://github.com/mycompany/my-first-extension/blob/main/LICENSE",
  "repository": {
    "type": "git",
    "url": "https://github.com/mycompany/my-first-extension"
  },
  "bugs": {
    "url": "https://github.com/mycompany/my-first-extension/issues"
  },
  "homepage": "https://github.com/mycompany/my-first-extension#readme",
  "pricing": "free",
  "aiLicense": "mit"
}
```

### Publishing Checklist

- [ ] Extension passes linting (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npm run compile`)
- [ ] No `out/` files in `.vscodeignore`
- [ ] `README.md` is comprehensive
- [ ] Extension has a working icon
- [ ] Extension has a gallery banner color
- [ ] License is specified
- [ ] Repository URL is valid
- [ ] Bug report URL is valid
- [ ] Extension follows [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/contribution-points)

---

## Pro Tips & Best Practices 🌟

### Performance Optimization

```typescript
// ❌ BAD: Blocking the main thread
export function activate(context: vscode.ExtensionContext) {
  const result = doHeavyComputation(); // Blocks UI!
  vscode.window.showInformationMessage(`Result: ${result}`);
}

// ✅ GOOD: Use a background task
import { debounce } from 'lodash';

export function activate(context: vscode.ExtensionContext) {
  const debouncedUpdate = debounce(() => {
    vscode.window.showInformationMessage('Updated!');
  }, 500);

  vscode.workspace.onDidChangeTextDocument(() => {
    debouncedUpdate();
  });
}
```

### Memory Management

```typescript
// Always use context.subscriptions.push() to clean up resources
export function activate(context: vscode.ExtensionContext) {
  // Commands
  const cmd1 = vscode.commands.registerCommand('extension.cmd1', handler1);
  const cmd2 = vscode.commands.registerCommand('extension.cmd2', handler2);

  // TreeViews
  const treeView = vscode.window.createTreeView('myView', { treeDataProvider });

  // Listeners
  const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('myExtension')) {
      refresh();
    }
  });

  // Webviews
  const panel = vscode.window.createWebviewPanel(...);

  // All disposables MUST be pushed to subscriptions
  context.subscriptions.push(cmd1, cmd2, treeView, disposable, panel);
}
```

### Error Handling

```typescript
export function activate(context: vscode.ExtensionContext) {
  try {
    // Your activation logic
  } catch (error) {
    console.error(`Extension activation failed: ${error.message}`);
    vscode.window.showErrorMessage(`Extension activation failed: ${error.message}`);
    throw error; // Re-throw to stop activation
  }
}
```

### Telemetry (Best Practices)

```typescript
import { sendTelemetryEvent } from 'vscode-extension-telemetry';

// ✅ DO: Use structured telemetry
sendTelemetryEvent(
  'myExtension.action',
  {
    action: 'click',
    button: 'save',
    success: true,
  },
  { value: 1 }
);

// ❌ DON'T: Send PII or large payloads
sendTelemetryEvent('myExtension.error', {
  stackTrace: fullStackTrace, // Too large!
  userFile: vscode.window.activeEditor?.document.uri.fsPath, // PII!
});
```

### Localization

```json
// package.json
{
  "contributes": {
    "commands": [
      {
        "command": "extension.sayHello",
        "title": "${locale:extension.hello.title}",
        "description": "${locale:extension.hello.description}"
      }
    ],
    "messages": {
      "extension.hello.title": "Hello World",
      "extension.hello.description": "Says hello to the world"
    }
  }
}
```

---

## Wrapping Up 🎉

You've now learned how to:

- ✅ Scaffold a VS Code extension with Yeoman
- ✅ Configure `package.json` for commands, keybindings, TreeViews, and settings
- ✅ Implement core features (commands, TreeViews, Webviews)
- ✅ Write unit and integration tests
- ✅ Set up CI/CD with GitHub Actions
- ✅ Package and publish to the Marketplace
- ✅ Follow best practices for performance, memory, and telemetry

### Next Steps

- 📖 [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- 📖 [Extension Development Guide](https://code.visualstudio.com/api/extension-guides)
- 📖 [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
- 📖 [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

> 💡 **Remember:** The best way to learn is to build. Start with a small extension, publish it, and iterate. The VS Code community is incredibly supportive — don't be afraid to ask questions!

Happy coding! 🚀

---

*Generated based on the guide from [dev.to](https://dev.to/anupam_kumar/hack-the-editor-craft-your-custom-vs-code-extension-like-a-pro-4dp5)*