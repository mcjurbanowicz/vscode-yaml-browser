# VS Extension Pipeline Quick Reference

## Quick Start Checklist

```
[ ] 1. Set up Azure DevOps project & repository
[ ] 2. Configure package.json (publisher, version, scripts)
[ ] 3. Create build/deploy scripts in scripts/
[ ] 4. Set up Azure DevOps Artifacts registry
[ ] 5. Configure pipeline variables in vars.yml
[ ] 6. Create pipeline templates in common-pipeline-templates/
[ ] 7. Configure build.yml trigger and stages
[ ] 8. Configure deploy.yml trigger and stages
[ ] 9. Test pipeline locally with 'az devops pipeline upload'
[ ] 10. Run first pipeline and verify outputs
```

## Template Hierarchy Quick Reference

```
┌─────────────────────────────────────────────────────────┐
│ Level 3: Main Pipeline (build.yml / deploy.yml)         │
│   └── Calls deploy-template.yml with params             │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Level 2: deploy-template.yml                             │
│   └── Calls build-template.yml with params              │
│   └── Calls common.yml for individual steps             │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Level 1: build-template.yml                              │
│   └── Calls common.yml for each build step              │
└─────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────┐
│ Level 0: common.yml                                      │
│   └── Base tasks: checkout, install, build, publish     │
└─────────────────────────────────────────────────────────┘
```

## Common Parameter Patterns

### Passing values from parent to child:
```yaml
# Parent template
- template: ./child-template.yml
  parameters:
    image: 'ubuntu-latest'
    shell: 'bash'
    stepName: 'My Custom Step'
```

### Accessing parameters inside child:
```yaml
# Inside child-template.yml
steps:
  - script: echo "Building for $(image) with $(shell)"
    displayName: $(stepName)
```

## Common Pipeline Patterns

### Pattern 1: Multi-Stage Build
```yaml
stages:
  - stage: build
    jobs:
      - job: build
        steps:
          - checkout
          - npm ci
          - npm run build

  - stage: test
    dependsOn: build
    jobs:
      - job: unit-tests
        steps:
          - npm run test:unit
      - job: e2e-tests
        steps:
          - npm run test:e2e
```

### Pattern 2: Parallel Build
```yaml
stages:
  - stage: build
    jobs:
      - job: build-linux
        steps:
          - template: ./build-template.yml
            parameters:
              image: 'ubuntu-latest'
              shell: 'bash'
      - job: build-windows
        steps:
          - template: ./build-template.yml
            parameters:
              image: 'windows-latest'
              shell: 'pwsh'
```

### Pattern 3: Conditional Deployment
```yaml
stages:
  - stage: build
    jobs:
      - job: build
        steps:
          - template: ./build-template.yml

  - stage: deploy
    jobs:
      - job: deploy-staging
        condition: eq(variables['Build.SourceBranch'], 'refs/heads/develop')
        steps:
          - template: ./deploy-template.yml
            parameters:
              environment: 'staging'

      - job: deploy-production
        condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')
        steps:
          - template: ./deploy-template.yml
            parameters:
              environment: 'production'
```

### Pattern 4: Approval Gate
```yaml
stages:
  - stage: build
    jobs:
      - job: build
        steps:
          - template: ./build-template.yml

  - stage: approval
    jobs:
      - job: approve
        steps:
          - script: echo "Pipeline is ready for approval"
            displayName: 'Approval Required'

  - stage: deploy
    dependsOn: approval
    condition: succeeded()
    jobs:
      - job: deploy
        steps:
          - template: ./deploy-template.yml
```

## Common Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `Build.BuildId` | Unique build ID | `12345678` |
| `Build.SourceBranch` | Source branch | `refs/heads/main` |
| `Build.SourceTimeDate` | Build timestamp | `2024-01-15T10:30:00Z` |
| `Agent.Name` | Agent hostname | `agent-01` |
| `Agent.Version` | Agent version | `3.2.0` |
| `BuildConfiguration` | Build config | `Release` |
| `System.DefaultWorkingDirectory` | Working dir | `C:\s\repo` |

## Common Task Names

| Task | Description |
|------|-------------|
| `NodeTool@0` | Install Node.js runtime |
| `Npm@0` | Install npm dependencies |
| `NpmInstall@0` | Run `npm install` |
| `NpmYarnInstall@0` | Run `npm install` or `yarn install` |
| `VSCodeExtension@0` | Build VS Code extension |
| `VSCodeTest@0` | Run VS Code extension tests |
| `VSCEPublish@0` | Publish extension to registry |
| `AzDevOps@0` | Azure DevOps CLI tasks |

## Common Error Scenarios

| Error | Cause | Fix |
|-------|-------|-----|
| `Template not found` | Wrong relative path | Use `./` prefix and check path from main YAML |
| `Parameter 'x' not found` | Parameter not defined | Add parameter to `parameters:` block |
| `Variable is empty` | Variable not set | Check `vars.yml` and pipeline variable settings |
| `Checkout failed` | Git not initialized | Add `checkout: self` step before other steps |
| `npm install failed` | Node version wrong | Ensure `NodeTool@0` uses correct `versionSpec` |

## Debugging Checklist

- [ ] Check template paths are relative to main YAML file
- [ ] Verify all parameters are passed to child templates
- [ ] Check variable names match exactly (case-sensitive)
- [ ] Ensure `checkout: self` is the first step
- [ ] Verify Node.js version is compatible with extension
- [ ] Check that scripts are executable and have correct paths
- [ ] Review pipeline run logs with `--verbose` flag

## Useful Commands

```bash
# Upload pipeline to Azure DevOps
az devops pipeline upload \
  --project my-project \
  --pipeline pipelines/build.yml \
  --branch main

# List pipeline variables
az devops variable list --project my-project

# Show pipeline structure
az devops pipeline show --project my-project --id 123

# Trigger pipeline
az devops pipeline run --project my-project --pipeline 123
```

## Security Checklist

- [ ] Never hardcode secrets in YAML files
- [ ] Use Azure DevOps variable groups for secrets
- [ ] Use service connections for registry access
- [ ] Enable pipeline-level secrets for passwords/tokens
- [ ] Use `variables` instead of `parameters` for secrets
- [ ] Rotate registry tokens regularly
- [ ] Use least-privilege permissions for service connections

## Performance Tips

- Use `continueOnError: true` for non-critical steps
- Use artifacts to avoid rebuilding across stages
- Use caching for `node_modules`
- Use parallel jobs where steps are independent
- Avoid nested `checkout` steps
- Use `pre: |` and `post: |` for reusable scripts

## File Locations Quick Reference

```
.vscode/settings.json          # VS Code workspace settings
package.json                   # Extension manifest
scripts/build.js              # Build script
scripts/package.js            # Package script
scripts/test.js              # Test script
pipelines/build.yml           # Main build pipeline
pipelines/deploy.yml          # Main deploy pipeline
pipelines/common-pipeline-templates/
  common.yml                  # Base template
  build-template.yml          # Build template
  deploy-template.yml         # Deploy template
pipelines/vars.yml            # Shared variables
```
