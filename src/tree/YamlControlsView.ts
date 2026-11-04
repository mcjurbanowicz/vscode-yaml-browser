import * as vscode from 'vscode';

export interface YamlControlsSettings {
  showConditions: boolean;
  showStageParameters: boolean;
  showJobParameters: boolean;
  showStepParameters: boolean;
}

interface YamlControl {
  label: string;
  command: string;
  icon: string;
}

export class YamlControlsViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private settings: YamlControlsSettings;

  constructor(settings: YamlControlsSettings) {
    this.settings = settings;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const controls: YamlControl[] = [
      { label: 'Collapse YAML', command: 'adoInspector.collapseYaml', icon: 'collapse-all' },
      { label: 'Expand YAML', command: 'adoInspector.expandYaml', icon: 'expand-all' },
      {
        label: 'Collapse Structure Tree',
        command: 'adoInspector.collapseStructureTree',
        icon: 'collapse-all',
      },
      {
        label: 'Expand Structure Tree',
        command: 'adoInspector.expandStructureTree',
        icon: 'expand-all',
      },
      { label: 'Validate YAML', command: 'adoInspector.validateYaml', icon: 'check' },
      {
        label: 'Expand Templates',
        command: 'adoInspector.expandTemplates',
        icon: 'layers',
      },
      {
        label: 'Generate Decision Paths',
        command: 'adoInspector.generateDecisionPaths',
        icon: 'graph',
      },
      this.toggleControl('Conditions', 'showConditions', 'adoInspector.toggleShowConditions'),
      this.toggleControl(
        'Stage Parameters',
        'showStageParameters',
        'adoInspector.toggleShowStageParameters'
      ),
      this.toggleControl(
        'Job Parameters',
        'showJobParameters',
        'adoInspector.toggleShowJobParameters'
      ),
      this.toggleControl(
        'Step Parameters',
        'showStepParameters',
        'adoInspector.toggleShowStepParameters'
      ),
    ];

    return controls.map((control) => {
      const item = new vscode.TreeItem(control.label);
      item.iconPath = new vscode.ThemeIcon(control.icon);
      item.command = {
        command: control.command,
        title: control.label,
      };
      return item;
    });
  }

  updateSettings(settings: YamlControlsSettings): void {
    this.settings = settings;
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private toggleControl(
    label: string,
    setting: keyof YamlControlsSettings,
    command: string
  ): YamlControl {
    const isShown = this.settings[setting];
    return {
      label: `${isShown ? 'Hide' : 'Show'} ${label}`,
      command,
      icon: isShown ? 'eye-closed' : 'eye',
    };
  }
}
