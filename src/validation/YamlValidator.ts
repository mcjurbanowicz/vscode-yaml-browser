import * as yaml from 'yaml';
import { YamlDiagnostic, TemplateDiagnostic } from '../types/diagnostic';

export class YamlValidator {
  private diagnostics: YamlDiagnostic[] = [];

  /**
   * Validate an Azure DevOps YAML document.
   * @param content The YAML content as a string
   * @param filePath The path to the file being validated
   * @returns An array of diagnostics
   */
  validate(content: string, filePath: string): YamlDiagnostic[] {
    this.diagnostics = [];

    try {
      const ast = yaml.parse(content, {
        prettyErrors: true,
      });

      if (ast && typeof ast === 'object') {
        this.validateDocument(ast, filePath, 0);
      }
    } catch (error) {
      this.diagnostics.push({
        file: filePath,
        line: 1,
        column: 1,
        message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error' as const,
        code: 'PARSE_ERROR',
      });
    }

    return this.diagnostics;
  }

  /**
   * Validate an Azure DevOps pipeline document.
   * @param doc The parsed YAML document
   * @param filePath The path to the file
   * @param depth The current depth in the document
   */
  private validateDocument(
    doc: unknown,
    filePath: string,
    depth: number
  ): void {
    if (!doc || typeof doc !== 'object') {
      return;
    }

    const docObj = doc as Record<string, unknown>;

    // Validate top-level structure
    if (depth === 0) {
      this.validateTopLevel(docObj, filePath, depth);
    }

    // Validate stages
    if (docObj.stages && Array.isArray(docObj.stages)) {
      this.validateStages(docObj.stages, filePath, depth);
    }

    // Validate jobs (at root level)
    if (docObj.jobs && Array.isArray(docObj.jobs)) {
      this.validateJobs(docObj.jobs, filePath, depth);
    }

    // Validate variables
    if (docObj.variables && typeof docObj.variables === 'object') {
      this.validateVariables(docObj.variables, filePath, depth);
    }

    // Validate parameters
    if (docObj.parameters && Array.isArray(docObj.parameters)) {
      this.validateParameters(docObj.parameters, filePath, depth);
    }
  }

  /**
   * Validate top-level document structure.
   */
  private validateTopLevel(
    doc: Record<string, unknown>,
    filePath: string,
    depth: number
  ): void {
    // Check for required fields if it looks like a pipeline
    const requiredFields = ['stages', 'jobs', 'pool', 'steps', 'trigger', 'workflow'];
    const hasPipelineFields = requiredFields.some(
      (field) => doc[field] !== undefined
    );

    if (hasPipelineFields) {
      // Validate each top-level field
      for (const key of Object.keys(doc)) {
        if (!requiredFields.includes(key)) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(doc, key),
            column: 1,
            message: `Unknown top-level field: "${key}"`,
            severity: 'warning' as const,
            code: 'UNKNOWN_FIELD',
          });
        }
      }
    }
  }

  /**
   * Validate stages.
   */
  private validateStages(
    stages: unknown[],
    filePath: string,
    depth: number
  ): void {
    stages.forEach((stage, index) => {
      if (!stage || typeof stage !== 'object') return;

      const stageObj = stage as Record<string, unknown>;

      // Validate stage properties
      if (stageObj.stage && typeof stageObj.stage === 'string') {
        const stageName = stageObj.stage as string;
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(stageName)) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(stageObj, 'stage'),
            column: 1,
            message: `Invalid stage name: "${stageName}". Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
            severity: 'error' as const,
            code: 'INVALID_STAGE_NAME',
          });
        }
      }

      // Validate jobs within stage
      if (stageObj.jobs && Array.isArray(stageObj.jobs)) {
        this.validateJobs(stageObj.jobs, filePath, depth + 1);
      }

      // Validate template references
      if (stageObj.template && typeof stageObj.template === 'string') {
        this.validateTemplateReference(
          stageObj.template,
          filePath,
          this.getLineNumber(stageObj, 'template'),
          depth + 1
        );
      }
    });
  }

  /**
   * Validate jobs.
   */
  private validateJobs(
    jobs: unknown[],
    filePath: string,
    depth: number
  ): void {
    jobs.forEach((job, index) => {
      if (!job || typeof job !== 'object') return;

      const jobObj = job as Record<string, unknown>;

      // Validate job properties
      if (jobObj.job && typeof jobObj.job === 'string') {
        const jobName = jobObj.job as string;
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(jobName)) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(jobObj, 'job'),
            column: 1,
            message: `Invalid job name: "${jobName}". Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
            severity: 'error' as const,
            code: 'INVALID_JOB_NAME',
          });
        }
      }

      // Validate template references
      if (jobObj.template && typeof jobObj.template === 'string') {
        this.validateTemplateReference(
          jobObj.template,
          filePath,
          this.getLineNumber(jobObj, 'template'),
          depth + 1
        );
      }

      // Validate steps
      if (jobObj.steps && Array.isArray(jobObj.steps)) {
        this.validateSteps(jobObj.steps, filePath, depth + 1);
      }
    });
  }

  /**
   * Validate steps.
   */
  private validateSteps(
    steps: unknown[],
    filePath: string,
    depth: number
  ): void {
    steps.forEach((step, index) => {
      if (!step || typeof step !== 'object') return;

      const stepObj = step as Record<string, unknown>;

      // Validate template references
      if (stepObj.template && typeof stepObj.template === 'string') {
        this.validateTemplateReference(
          stepObj.template,
          filePath,
          this.getLineNumber(stepObj, 'template'),
          depth + 1
        );
      }

      // Validate 'script' step
      if (stepObj.script && typeof stepObj.script === 'string') {
        this.validateScriptStep(stepObj, filePath, depth + 1);
      }

      // Validate 'powershell' step
      if (stepObj.powershell && typeof stepObj.powershell === 'string') {
        this.diagnostics.push({
          file: filePath,
          line: this.getLineNumber(stepObj, 'powershell'),
          column: 1,
          message: 'The "powershell" step is deprecated. Use "pwsh" instead.',
          severity: 'warning' as const,
          code: 'DEPRECATED_POWERSHELL',
        });
      }

      // Validate 'bash' step
      if (stepObj.bash && typeof stepObj.bash === 'string') {
        this.validateScriptStep(stepObj, filePath, depth + 1);
      }

      // Validate 'always' block
      if (stepObj.always && typeof stepObj.always === 'string') {
        this.validateScriptStep(stepObj, filePath, depth + 1);
      }

      // Validate 'if' block
      if (stepObj.if && typeof stepObj.if === 'string') {
        this.validateScriptStep(stepObj, filePath, depth + 1);
      }

      // Validate 'continueOnError'
      if (stepObj.continueOnError !== undefined) {
        if (
          typeof stepObj.continueOnError === 'string' &&
          stepObj.continueOnError === 'false'
        ) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(stepObj, 'continueOnError'),
            column: 1,
            message: 'continueOnError should be a boolean, not the string "false".',
            severity: 'warning' as const,
            code: 'INVALID_CONTINUE_ON_ERROR',
          });
        }
      }
    });
  }

  /**
   * Validate a script step.
   */
  private validateScriptStep(
    step: Record<string, unknown>,
    filePath: string,
    depth: number
  ): void {
    const stepObj = step as Record<string, unknown>;

    // Validate 'continueOnError'
    if (stepObj.continueOnError !== undefined) {
      if (
        typeof stepObj.continueOnError === 'string' &&
        stepObj.continueOnError === 'false'
      ) {
        this.diagnostics.push({
          file: filePath,
          line: this.getLineNumber(stepObj, 'continueOnError'),
          column: 1,
          message: 'continueOnError should be a boolean, not the string "false".',
          severity: 'warning' as const,
          code: 'INVALID_CONTINUE_ON_ERROR',
        });
      }
    }

    // Validate 'condition'
    if (stepObj.condition && typeof stepObj.condition === 'string') {
      // Check for invalid condition syntax
      if (!stepObj.condition.includes('()') && !stepObj.condition.includes('==')) {
        // This is a simplified check - Azure DevOps conditions can be complex
        // We just flag obviously invalid patterns
        if (
          stepObj.condition.match(/\$([a-zA-Z_]\w+)\.([a-zA-Z_]\w+)/)
        ) {
          // It's a valid variable reference
        } else {
          // Might be an invalid condition
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(stepObj, 'condition'),
            column: 1,
            message: 'Condition may be invalid. Ensure it uses proper Azure DevOps condition syntax.',
            severity: 'info' as const,
            code: 'POTENTIALLY_INVALID_CONDITION',
          });
        }
      }
    }

    // Validate 'dependsOn'
    if (stepObj.dependsOn && typeof stepObj.dependsOn === 'string') {
      const dependsOn = stepObj.dependsOn as string;
      if (!/^[a-zA-Z0-9_-]+$/.test(dependsOn)) {
        this.diagnostics.push({
          file: filePath,
          line: this.getLineNumber(stepObj, 'dependsOn'),
          column: 1,
          message: `Invalid dependency reference: "${dependsOn}". Must reference a job or stage.`,
          severity: 'error' as const,
          code: 'INVALID_DEPENDS_ON',
        });
      }
    }

    // Validate 'prerequires' (typo detection)
    if (stepObj.prerequires) {
      this.diagnostics.push({
        file: filePath,
        line: this.getLineNumber(stepObj, 'prerequires'),
        column: 1,
        message: 'Did you mean "prerequisites"? This is a common typo.',
        severity: 'info' as const,
        code: 'TYPO_DETECTED',
      });
    }

    // Validate 'strategy'
    if (stepObj.strategy && typeof stepObj.strategy === 'object') {
      this.validateStrategy(stepObj.strategy, filePath, depth + 1);
    }
  }

  /**
   * Validate a strategy block.
   */
  private validateStrategy(
    strategy: unknown,
    filePath: string,
    depth: number
  ): void {
    if (!strategy || typeof strategy !== 'object') return;

    const strategyObj = strategy as Record<string, unknown>;

    // Validate matrix strategy
    if (strategyObj.matrix) {
      if (typeof strategyObj.matrix === 'object') {
        const matrix = strategyObj.matrix as Record<string, unknown>;
        if (matrix.strategy) {
          if (
            matrix.strategy.strategy === 'combinatorial' &&
            matrix.strategy.maxParallel !== undefined
          ) {
            if (typeof matrix.strategy.maxParallel === 'string') {
              this.diagnostics.push({
                file: filePath,
                line: this.getLineNumber(matrix.strategy, 'maxParallel'),
                column: 1,
                message: 'maxParallel should be a number, not a string.',
                severity: 'warning' as const,
                code: 'INVALID_MAX_PARALLEL',
              });
            }
          }
        }
      }
    }

    // Validate matrix strategy
    if (strategyObj.matrix && typeof strategyObj.matrix === 'object') {
      const matrix = strategyObj.matrix as Record<string, unknown>;
      if (matrix.strategy) {
        if (matrix.strategy.strategy === 'matrix') {
          if (
            typeof matrix.strategy.maxParallel === 'string' &&
            matrix.strategy.maxParallel !== '1'
          ) {
            this.diagnostics.push({
              file: filePath,
              line: this.getLineNumber(matrix.strategy, 'maxParallel'),
              column: 1,
              message: 'maxParallel should be a number, not a string.',
              severity: 'warning' as const,
              code: 'INVALID_MAX_PARALLEL',
            });
          }
        }
      }
    }
  }

  /**
   * Validate template references.
   */
  private validateTemplateReference(
    templatePath: string,
    filePath: string,
    line: number,
    depth: number
  ): void {
    // Validate template path format
    if (!templatePath.startsWith('./') && !templatePath.startsWith('../')) {
      this.diagnostics.push({
        file: filePath,
        line: line,
        column: 1,
        message: `Template reference "${templatePath}" should be a relative path (starts with ./ or ../).`,
        severity: 'warning' as const,
        code: 'TEMPLATE_PATH_FORMAT',
      });
    }

    // Validate template name (should be a valid filename)
    const parts = templatePath.split('/');
    const fileName = parts[parts.length - 1];
    if (!fileName || !/\.yml$|\.yaml$/.test(fileName)) {
      this.diagnostics.push({
        file: filePath,
        line: line,
        column: 1,
        message: `Template reference "${templatePath}" does not end with .yml or .yaml.`,
        severity: 'error' as const,
        code: 'INVALID_TEMPLATE_PATH',
      });
    }

    // Log for further validation by the scanner
    this.diagnostics.push({
      file: filePath,
      line: line,
      column: 1,
      message: `Template reference found: "${templatePath}" at depth ${depth}`,
      severity: 'info' as const,
      code: 'TEMPLATE_REFERENCE',
    });
  }

  /**
   * Validate variables.
   */
  private validateVariables(
    variables: unknown,
    filePath: string,
    depth: number
  ): void {
    if (!variables || typeof variables !== 'object') return;

    const variablesObj = variables as Record<string, unknown>;

    for (const [key, value] of Object.entries(variablesObj)) {
      // Check for invalid variable names
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        this.diagnostics.push({
          file: filePath,
          line: this.getLineNumber(variablesObj, key),
          column: 1,
          message: `Invalid variable name: "${key}". Variable names must start with a letter or underscore.`,
          severity: 'warning' as const,
          code: 'INVALID_VARIABLE_NAME',
        });
      }
    }
  }

  /**
   * Validate parameters.
   */
  private validateParameters(
    parameters: unknown[],
    filePath: string,
    depth: number
  ): void {
    parameters.forEach((param, index) => {
      if (!param || typeof param !== 'object') return;

      const paramObj = param as Record<string, unknown>;

      // Validate parameter name
      if (paramObj.name && typeof paramObj.name === 'string') {
        const paramName = paramObj.name as string;
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(paramObj, 'name'),
            column: 1,
            message: `Invalid parameter name: "${paramName}". Parameter names must start with a letter or underscore.`,
            severity: 'error' as const,
            code: 'INVALID_PARAMETER_NAME',
          });
        }
      }

      // Validate parameter type
      if (paramObj.type && typeof paramObj.type === 'string') {
        const validTypes = ['string', 'number', 'boolean', 'choice', 'object', 'array'];
        if (!validTypes.includes(paramObj.type as string)) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(paramObj, 'type'),
            column: 1,
            message: `Invalid parameter type: "${paramObj.type}". Valid types are: ${validTypes.join(', ')}.`,
            severity: 'error' as const,
            code: 'INVALID_PARAMETER_TYPE',
          });
        }
      }

      // Validate parameter choices
      if (paramObj.choices && Array.isArray(paramObj.choices)) {
        const choices = paramObj.choices as unknown[];
        if (choices.some(c => typeof c !== 'string')) {
          this.diagnostics.push({
            file: filePath,
            line: this.getLineNumber(paramObj, 'choices'),
            column: 1,
            message: 'All choices must be strings.',
            severity: 'error' as const,
            code: 'INVALID_CHOICE_TYPE',
          });
        }
      }

      // Validate default value type matches parameter type
      if (
        paramObj.default !== undefined &&
        paramObj.type &&
        typeof paramObj.type === 'string'
      ) {
        this.validateDefaultValue(paramObj, filePath, depth);
      }
    });
  }

  /**
   * Validate a parameter's default value matches its declared type.
   */
  private validateDefaultValue(
    param: Record<string, unknown>,
    filePath: string,
    depth: number
  ): void {
    const type = param.type as string;
    const defaultVal = param.default;

    if (type === 'number' && typeof defaultVal !== 'number') {
      this.diagnostics.push({
        file: filePath,
        line: this.getLineNumber(param, 'default'),
        column: 1,
        message: `Parameter "${param.name}" has type "number" but default value is not a number.`,
        severity: 'error' as const,
        code: 'MISMATCHED_PARAMETER_DEFAULT',
      });
    } else if (type === 'boolean' && typeof defaultVal !== 'boolean') {
      this.diagnostics.push({
        file: filePath,
        line: this.getLineNumber(param, 'default'),
        column: 1,
        message: `Parameter "${param.name}" has type "boolean" but default value is not a boolean.`,
        severity: 'error' as const,
        code: 'MISMATCHED_PARAMETER_DEFAULT',
      });
    } else if (type === 'choice') {
      // Check if default is a valid choice
      if (
        Array.isArray(param.choices) &&
        !param.choices.includes(defaultVal)
      ) {
        this.diagnostics.push({
          file: filePath,
          line: this.getLineNumber(param, 'default'),
          column: 1,
          message: `Parameter "${param.name}" default value is not in the choices list.`,
          severity: 'error' as const,
          code: 'INVALID_PARAMETER_DEFAULT',
        });
      }
    }
  }

  /**
   * Helper to get the line number of a property in an object.
   */
  private getLineNumber(obj: Record<string, unknown>, key: string): number {
    // Simple heuristic: find the key in the object
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) {
        return 1; // Simplified - in production, use a proper line-numbering library
      }
    }
    return 1;
  }

  /**
   * Get all diagnostics.
   */
  getDiagnostics(): YamlDiagnostic[] {
    return this.diagnostics;
  }

  /**
   * Clear diagnostics.
   */
  clear(): void {
    this.diagnostics = [];
  }
}
