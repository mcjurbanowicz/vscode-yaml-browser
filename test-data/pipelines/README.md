# Azure DevOps YAML Pipeline Template Hierarchy

This project demonstrates a **3-level nested template hierarchy** in Azure DevOps YAML pipelines.

## Directory Structure

```
pipelines/
├── common-pipeline-templates/
│   ├── common.yml               # Level 0 — Base utilities
│   ├── build-template.yml       # Level 1 — Build logic
│   └── deploy-template.yml      # Level 2 — Deploy logic
├── vars.yml                     # Shared variables (Level 0)
├── build.yml                    # Main YAML 1 — Build pipeline
└── deploy.yml                   # Main YAML 2 — Deploy pipeline
```

## Template Hierarchy (3 Levels Deep)

```
Level 3 (Main Pipeline)
    └── deploy-template.yml (Level 2)
            └── build-template.yml (Level 1)
                    └── common.yml (Level 0)
```

### Template Chain Example

When `deploy.yml` includes `deploy-template.yml`:

1. **Level 2** (`deploy-template.yml`) receives parameters from the main pipeline
2. **Level 2** calls `build-template.yml` with nested parameters
3. **Level 1** (`build-template.yml`) receives parameters from Level 2
4. **Level 1** calls `common.yml` with nested parameters
5. **Level 0** (`common.yml`) receives parameters from Level 1
6. **Level 0** includes `vars.yml` for shared variables

## How Templates Are Nested

### `template:` Directive
References another YAML file **within the same repository**:

```yaml
- template: ./common-pipeline-templates/deploy-template.yml
```

### Parameter Passing
Parameters flow **downward** from parent to child templates:

```yaml
# Parent passes to child
- template: ./build-template.yml
  parameters:
    image: 'ubuntu-latest'
    shell: 'bash'
```

### Conditional Inclusion
Templates can be conditionally included:

```yaml
- ${{ if eq(parameters.environment, 'staging') }}:
    - template: build-template.yml
      parameters:
        shell: 'bash'
```

## Usage

### Using in Azure DevOps

1. Import this repository into Azure DevOps
2. Select a YAML pipeline file (`build.yml` or `deploy.yml`)
3. Configure pipeline settings:
   - Choose a branch/folder
   - Set pipeline settings (agents, queues, etc.)

### Example Run

```yaml
# build.yml usage:
- template: ./common-pipeline-templates/deploy-template.yml
  parameters:
    environment: 'staging'
    buildImage: 'ubuntu-latest'
```

### Example Run

```yaml
# deploy.yml usage:
- template: ./common-pipeline-templates/deploy-template.yml
  parameters:
    environment: 'production'
    deployType: 'blue-green'
```

## Key Concepts

| Concept | Description |
|---------|-------------|
| `template:` | Includes another YAML file in the pipeline |
| `parameters` | Pass data between templates |
| `${{ }}` | Expression evaluation (runtime) |
| `$${{ if }}` | Conditional inclusion |
| `$${{ eq() }}` | Equality comparison |
| `$${{ parameters.xxx }}` | Access parent parameters |

## Benefits

- **Reusability**: Define logic once, use everywhere
- **Maintainability**: Change in Level 0 propagates to all usages
- **Organization**: Separate concerns across template levels
- **Flexibility**: Parameters allow customization without code changes
- **DRY Principle**: Eliminate duplication across pipelines

## Testing

Run any pipeline in Azure DevOps to see the cascading template execution:

1. Create a pipeline from `pipelines/build.yml`
2. Commit changes to trigger the pipeline
3. Observe the stage/job execution order in the run view

## Notes

- Templates must be in the **same repository** as the main YAML
- Relative paths are resolved from the **main YAML file's location**
- Parameters passed to a template are available as `$(parameters.paramName)` inside it
- Nested templates execute in **order** from top to bottom
