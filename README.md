# Azure DevOps YAML Inspector

A VS Code extension in development for navigating and validating Azure DevOps YAML pipelines. It is intended to work alongside VS Code's regular YAML editor and never modify pipeline files.

## Development in WSL

This repository uses Node.js 22 LTS through `nvm` and npm. From Ubuntu WSL, run:

```bash
cd /mnt/e/git/VS-extention
chmod +x setup-wsl.sh
./setup-wsl.sh
```

The setup script installs Node.js 22 for the WSL user and installs dependencies with `npm ci` when a lockfile is present. It does not install VS Code or require root access. Open the WSL folder in VS Code with `code .`, then press `F5` to launch the Extension Development Host.

For manual setup and troubleshooting, see `WSL_SETUP.md` in the workspace.

## Build

```bash
npm run compile
```

## YAML Inspector and YAML Controls

The **YAML Inspector** side bar contains a **Template Explorer** view for navigating
the active file's template references and a **YAML Structure** view showing its
parameters, variables, schedules, triggers, stages, jobs, and steps. Select an
item to jump to its source location. The expandable **Template references**
group lists local files referenced by the active file and files that reference it.

The **YAML Controls** panel provides **Collapse YAML** and **Expand YAML** to
fold or unfold the active editor, **Collapse Structure Tree** and
**Expand Structure Tree** to control the outline, **Validate YAML** to
refresh diagnostics, and **Expand Templates** to open a new unsaved YAML
document with local templates recursively inlined as a unified pipeline. Use
its Show/Hide actions to toggle conditions and stage,
job, and step parameters in the structure tree. The **Expand Templates** action
in the YAML Controls panel (also available from the YAML Structure toolbar)
opens an editable, unsaved YAML document with local templates recursively
inlined. Simple template
parameter references are substituted; compile-time `if` and `each` expressions
remain unchanged. The source pipeline and templates are not modified.
Use **Generate Decision Paths** to simulate the conditions in either a pipeline
or an already-expanded YAML document. The command suggests parameter and
variable values found in condition expressions, highlights the route for the
selected scenario in a Mermaid preview, and shows both branches when an
expression is unsupported by the local evaluator or requires Azure runtime
context. Status functions are simulated assuming previous work succeeded;
actual Azure dependency and cancellation state cannot be inferred locally.
Optional conditions and stage, job, and step parameters
can be enabled with the `adoInspector.showConditions`,
`adoInspector.showStageParameters`, `adoInspector.showJobParameters`, and
`adoInspector.showStepParameters` settings.
The YAML Inspector side bar and YAML Controls panel open when VS Code starts
by default. Disable `adoInspector.showPanel` to turn off this behavior.

Stage, job, and step icons use distinct colors for concrete entries and
templates. Their colors can be overridden with the corresponding
`adoInspector.*IconForeground` entries in `workbench.colorCustomizations`.

## Test data

Sample Azure DevOps pipeline YAML is under `test-data/pipelines/`.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
