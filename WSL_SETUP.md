# WSL Development Setup

## Prerequisites

Install WSL 2 with Ubuntu from Windows PowerShell if needed:

```powershell
wsl --install -d Ubuntu
```

Start Ubuntu and go to the repository. For this checkout:

```bash
cd /mnt/e/git/VS-extention
```

## Automated setup

```bash
chmod +x setup-wsl.sh
./setup-wsl.sh
```

The script installs `nvm` for the current WSL user if necessary, selects Node.js 22 LTS (which includes npm), and installs project dependencies. It does not use `sudo` unless a prerequisite is missing, and it does not install VS Code inside Linux.

## Manual setup

Install `curl` if needed, then install `nvm` and Node.js 22:

```bash
sudo apt-get update
sudo apt-get install -y curl git
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Load `nvm` in the current shell, install Node, and install the project dependencies:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
cd /mnt/e/git/VS-extention
npm ci
```

If `package-lock.json` is absent, use `npm install` instead of `npm ci`.

## Open and run the extension

Install the VS Code WSL extension on the Windows VS Code installation. From the Ubuntu shell in the repository, run:

```bash
code .
```

This opens the folder in VS Code connected to WSL. Press `F5` to start the Extension Development Host in the WSL environment.

## Verify the toolchain

```bash
node --version
npm --version
npm run compile
```

The project currently has TypeScript errors; successful dependency installation does not yet mean the extension builds. See the latest compiler output while implementation continues.
