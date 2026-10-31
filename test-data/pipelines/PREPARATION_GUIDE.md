# VS Extension Pipeline Preparation Guide

## Overview

This guide explains how to prepare a VS Code Extension project for deployment using Azure DevOps YAML pipelines. It covers the complete workflow from project setup to pipeline execution.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Pipeline Template Hierarchy](#pipeline-template-hierarchy)
4. [Step-by-Step Preparation](#step-by-step-preparation)
5. [Pipeline Files Explanation](#pipeline-files-explanation)
6. [Customization Guide](#customization-guide)
7. [Best Practices](#best-practices)

---

## Prerequisites

Before preparing your VS Extension for pipeline deployment, ensure you have:

- **Azure DevOps Organization** with a project created
- **Azure DevOps Extension Registry** (or existing extension to register)
- **Git repository** containing your VS Code extension
- **Azure DevOps Pipeline Agent** access (or configured agents)
- **Extension Manifest** (`package.json`) with proper metadata
- **Build/Deploy Scripts** (`scripts/build.js`, `scripts/package.js`, etc.)

---

## Project Structure

A typical VS Code Extension project structure:

```
vs-extension/
├── .azure-pipelines/           # Azure DevOps pipeline files
│   ├── common-pipeline-templates/
│   │   ├── common.yml         # Base utilities template
│   │   ├── build-template.yml # Build logic template
│   │   └── deploy-template.yml # Deploy logic template
│   ├── vars.yml               # Shared variables
│   ├── build.yml              # Main build pipeline
│   └── deploy.yml             # Main deploy pipeline
├── .vscode/                    # VS Code workspace settings
│   └── settings.json
├── package.json               # Extension manifest
├── package-lock.json
├── src/                       # Extension source code
│   └── ...
├── scripts/                   # Build/deploy scripts
│   ├── build.js
│   ├── package.js
│   └── test.js
├── test/                      # Test files
│   └── ...
├── extensions/                # Extension assets
├── media/                     # Images, icons, etc.
└── README.md
```

---

## Pipeline Template Hierarchy

The pipeline uses a **3-level nested template hierarchy** for reusability and maintainability:

```
Level 3 (Main Pipeline)
    └── deploy-template.yml (Level 2)
            └── build-template.yml (Level 1)
                    └── common.yml (Level 0)
```

### Level 0 — Base Utilities (`common.yml`)
- Contains reusable tasks (checkout, npm install, build)
- Defines common steps used across all pipelines
- Lowest level of abstraction

### Level 1 — Build Template (`build-template.yml`)
- Orchestrates the build process
- Calls Level 0 templates for individual steps
- Accepts build-specific parameters (image, shell, version)

### Level 2 — Deploy Template (`deploy-template.yml`)
- Orchestrates the deployment process
- Calls Level 1 templates for build preparation
- Accepts deployment-specific parameters (environment, deploy type)

### Level 3 — Main Pipeline (`build.yml` / `deploy.yml`)
- Entry point for the pipeline
- Defines stages, jobs, and triggers
- Calls Level 2 templates with pipeline parameters

---

## Step-by-Step Preparation

### Step 1: Define Extension Manifest (`package.json`)

Your extension's `package.json` must include:

```json
{
  "name": "my-vs-extension",
  "displayName": "My VS Extension",
  "version": "1.0.0",
  "publisher": "your-publisher-name",
  "description": "Description of your extension",
  "engines": {
    "vscode": "^1.74.0"
  },
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs",
    "package": "vsce package",
    "test": "node scripts/test.js"
  },
  "contributes": {
    "commands": [],
    "menus": {},
    "keybindings": [],
    "breakpoints": [],
    "debuggers": [],
    "icons": [],
    "colors": [],
    "grammars": [],
    "themes": [],
    "localizationSupport": true
  }
}
```

### Step 2: Configure Build Scripts

Create build scripts in `scripts/build.js`:

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

// Clean previous build
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}

// Build extension
console.log('Building extension...');
execSync('npm run build', { stdio: 'inherit' });

// Package extension
console.log('Packaging extension...');
execSync('npm run package', { stdio: 'inherit' });

// Upload to Azure DevOps Artifacts
console.log('Uploading artifacts...');
const artifactName = process.env.ARTIFACT_NAME || 'vs-extension';
execSync(`az devops artifact upload --project ${process.env.PROJECT_NAME} --pipeline ${process.env.PipelineId} --path dist --name ${artifactName}`, { stdio: 'inherit' });

console.log('Build completed successfully!');
```

### Step 3: Configure Test Scripts

Create test scripts in `scripts/test.js`:

```javascript
const { execSync } = require('child_process');

console.log('Running unit tests...');
execSync('npm run test', { stdio: 'inherit' });

console.log('All tests passed!');
```

### Step 4: Set Up Azure DevOps Repository

1. **Create a repository** in your Azure DevOps project
2. **Upload your extension source code** to the repository
3. **Ensure pipeline files** are in the `.azure-pipelines` folder

### Step 5: Configure Pipeline Variables

In `vars.yml`, define shared variables:

```yaml
---
# Shared variables available across all pipelines
variables:
  - name: BuildId
    value: '$(Build.BuildId)'
  - name: PipelineName
    value: 'Main Pipeline'
  - name: SourceBranch
    value: '$(Build.SourceBranch)'
  - name: BuildNumber
    value: '$(Build.BuildNumber)'
  - name: AgentName
    value: '$(Agent.Name)'
  - name: BuildConfiguration
    value: '$(BuildConfiguration)'
  - name: ArtifactName
    value: 'vs-extension'
  - name: ExtensionVersion
    value: '$(System.DefaultWorkingDirectory)/package.json'
```

### Step 6: Create Pipeline Templates

#### Level 0 — `common.yml` (Base Utilities)

```yaml
parameters:
  - name: image
    type: string
    default: 'ubuntu-latest'
  - name: shell
    type: string
    default: 'bash'
  - name: stepName
    type: string
    default: 'Common Step'

steps:
  - checkout: self
    clean: true
    fetchDepth: 1

  - task: NodeTool@0
    inputs:
      versionSpec: '>=18.0.0'
    displayName: 'Install Node.js'

  - script: |
      echo "Running in: $(Agent.Name) on $(Build.BuildId)"
    displayName: $(stepName)
    condition: always()
```

#### Level 1 — `build-template.yml`

```yaml
parameters:
  - name: image
    type: string
    default: 'ubuntu-latest'
  - name: shell
    type: string
    default: 'bash'
  - name: nodeVersion
    type: string
    default: '18'
  - name: buildTask
    type: string
    default: 'npm run build'

steps:
  - template: ../common-pipeline-templates/common.yml
    parameters:
      image: $(image)
      shell: $(shell)
      stepName: 'Checkout Source'

  - template: ../common-pipeline-templates/common.yml
    parameters:
      image: $(image)
      shell: $(shell)
      stepName: 'Install Dependencies'
    continueOnError: false

  - template: ../common-pipeline-templates/common.yml
    parameters:
      image: $(image)
      shell: $(shell)
      stepName: 'Build Extension'
    continueOnError: false
```

#### Level 2 — `deploy-template.yml`

```yaml
parameters:
  - name: environment
    type: string
    default: 'staging'
  - name: deployType
    type: string
    default: 'vsce-publish'
  - name: registryUrl
    type: string
    default: 'https://registry.npmjs.org'
  - name: registryToken
    type: string
    default: ''

steps:
  - template: ../common-pipeline-templates/common.yml
    parameters:
      image: 'ubuntu-latest'
      shell: 'bash'
      stepName: 'Deploy: Validate Manifest'
    continueOnError: false

  - template: ../common-pipeline-templates/common.yml
    parameters:
      image: 'ubuntu-latest'
      shell: 'bash'
      stepName: 'Deploy: Publish to Registry'
    continueOnError: false
```

#### Level 3 — `build.yml` (Main Build Pipeline)

```yaml
trigger:
  - main
  - develop

pool:
  vmImage: 'ubuntu-latest'

parameters:
  - name: environment
    type: string
    default: 'staging'
  - name: buildImage
    type: string
    default: 'ubuntu-latest'
  - name: nodeVersion
    type: string
    default: '18'

stages:
  - stage: build
    displayName: 'Build Stage'
    jobs:
      - job: build
        displayName: 'Build Job'
        steps:
          - template: ./common-pipeline-templates/deploy-template.yml
            parameters:
              environment: ${{ parameters.environment }}
              buildImage: ${{ parameters.buildImage }}
              nodeVersion: ${{ parameters.nodeVersion }}

  - stage: test
    displayName: 'Test Stage'
    dependsOn: build
    condition: succeeded()
    jobs:
      - job: test
        displayName: 'Test Job'
        steps:
          - template: ./common-pipeline-templates/deploy-template.yml
            parameters:
              environment: ${{ parameters.environment }}
              buildImage: ${{ parameters.buildImage }}
              nodeVersion: ${{ parameters.nodeVersion }}
```

#### Level 3 — `deploy.yml` (Main Deploy Pipeline)

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

parameters:
  - name: environment
    type: string
    default: 'production'
  - name: deployType
    type: string
    default: 'vsce-publish'
  - name: registryUrl
    type: string
    default: 'https://registry.npmjs.org'
  - name: registryToken
    type: string
    default: ''

stages:
  - stage: build
    displayName: 'Build Stage'
    jobs:
      - job: build
        displayName: 'Build Job'
        steps:
          - template: ./common-pipeline-templates/deploy-template.yml
            parameters:
              environment: ${{ parameters.environment }}
              deployType: ${{ parameters.deployType }}
              registryUrl: ${{ parameters.registryUrl }}
              registryToken: ${{ parameters.registryToken }}

  - stage: deploy
    displayName: 'Deploy Stage'
    dependsOn: build
    condition: succeeded()
    jobs:
      - job: deploy
        displayName: 'Deploy Job'
        steps:
          - template: ./common-pipeline-templates/deploy-template.yml
            parameters:
              environment: ${{ parameters.environment }}
              deployType: ${{ parameters.deployType }}
              registryUrl: ${{ parameters.registryUrl }}
              registryToken: ${{ parameters.registryToken }}
```

---

## Pipeline Files Explanation

### `vars.yml` — Shared Variables

Centralized variable definitions used across all pipeline templates. Avoids duplication and ensures consistency.

### `common.yml` — Base Template

The foundation layer containing:
- Source checkout
- Node.js tool installation
- Common script execution
- Artifact upload utilities

### `build-template.yml` — Build Orchestration

Coordinates the build process by calling common tasks in a specific order:
1. Checkout source code
2. Install dependencies
3. Execute build scripts
4. Package the extension

### `deploy-template.yml` — Deploy Orchestration

Coordinates the deployment process:
1. Validate extension manifest
2. Upload artifacts
3. Publish to registry (vsce-publish) or marketplace
4. Rollout configuration

### `build.yml` — Build Pipeline Entry Point

Triggers on code changes, runs the build stage, and produces a distributable package.

### `deploy.yml` — Deploy Pipeline Entry Point

Triggers on release tags or scheduled intervals, performs validation, and publishes the extension.

---

## Customization Guide

### Customizing the Build Process

Modify `scripts/build.js` to add custom build steps:

```javascript
// Add TypeScript compilation
execSync('npm run tsc', { stdio: 'inherit' });

// Add linting
execSync('npm run lint', { stdio: 'inherit' });

// Add post-build processing
fs.copyFileSync('dist/extension.js', 'dist/extension.min.js');
```

### Customizing the Deploy Process

Modify `scripts/deploy.js`:

```javascript
// Publish with versioning
const pkg = require('../package.json');
execSync(`vsce publish ${pkg.version} --yes`, { stdio: 'inherit' });

// Or upload to Azure DevOps Artifacts
execSync(`az devops artifact upload --path dist --name vs-extension`, { stdio: 'inherit' });
```

### Adding Custom Pipeline Stages

Add to `deploy.yml`:

```yaml
stages:
  - stage: build
    ...

  - stage: package
    displayName: 'Package Stage'
    dependsOn: build
    jobs:
      - job: package
        displayName: 'Package Extension'
        steps:
          - script: npm run package
            displayName: 'Create .vsix Package'

  - stage: deploy
    ...
```

### Environment-Specific Configuration

Use parameters and variables for different environments:

```yaml
# Staging
parameters:
  - name: environment
    type: string
    default: 'staging'

variables:
  - name: registryUrl
    value: ${{ if eq(parameters.environment, 'staging') }}staging-registry.example.com${{ else }}https://registry.npmjs.org${{ endif }}
```

### Adding Approval Gates

```yaml
stages:
  - stage: build
    ...

  - stage: approval
    displayName: 'Approval Stage'
    dependsOn: build
    jobs:
      - job: approve
        displayName: 'Approve Deployment'
        steps:
          - script: echo "Waiting for approval..."
            displayName: 'Wait for Approval'

  - stage: deploy
    displayName: 'Deploy Stage'
    dependsOn: approval
    condition: succeeded()
    ...
```

---

## Best Practices

### 1. Template Reusability
- **DRY Principle**: Reuse common tasks via templates
- **Single Responsibility**: Each template should do one thing well
- **Parameterize Everything**: Make templates flexible with parameters

### 2. Error Handling
- Use `continueOnError: false` for critical steps
- Use `continueOnError: true` for non-blocking steps (e.g., linting)
- Add `condition: failed()` to ensure previous steps complete

### 3. Security
- Store secrets in Azure DevOps **variables**, not in pipeline files
- Use **service connections** for registry authentication
- Enable **pipeline secrets** for sensitive values

### 4. Performance
- Use **multi-stage pipelines** for parallel execution
- Use **artifacts** to avoid rebuilding in every stage
- Use **caching** for node_modules with `Npm:Download` tasks

### 5. Maintainability
- Document each template's purpose
- Use **meaningful parameter names**
- Add **comments** explaining non-obvious logic
- Keep templates under 100 lines when possible

### 6. Testing
- Add **unit tests** for extension functionality
- Add **E2E tests** for integration scenarios
- Use **pipeline variables** to run different test suites per environment

### 7. Monitoring
- Add **pipeline logging** with structured output
- Use **Azure DevOps dashboards** to track build health
- Set up **notifications** for pipeline failures

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Template not found | Check the relative path is correct from the main YAML file |
| Parameter mismatch | Ensure parameter names match exactly between parent and child |
| Artifacts not uploading | Verify `az devops` CLI is configured and authenticated |
| Build fails silently | Add `continueOnError: false` to critical steps |
| Variables not propagating | Use `parameters:` block in templates, not `variables:` |

### Debugging Tips

1. **Enable pipeline variables**: Add a `Print Variable` step to inspect values
2. **Use echo statements**: Add `echo $(variableName)` to see resolved values
3. **Check template paths**: Relative paths are resolved from the main YAML location
4. **Use pipeline logs**: Enable verbose logging in pipeline settings

---

## References

- [Azure DevOps YAML Pipelines Documentation](https://docs.microsoft.com/en-us/azure/devops/pipelines/yaml-schema?view=azure-devops&tabs=schema)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-manifest)
- [Azure DevOps Artifacts](https://docs.microsoft.com/en-us/azure/devops/pipelines/artifacts/overview)
- [vsce Documentation](https://github.com/microsoft/vsce)

---

## License

This pipeline template is licensed under the MIT License.