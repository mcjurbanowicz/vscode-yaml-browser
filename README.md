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

## Test data

Sample Azure DevOps pipeline YAML is under `test-data/pipelines/`.
