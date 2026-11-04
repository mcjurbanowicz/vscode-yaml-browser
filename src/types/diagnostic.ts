export interface YamlDiagnostic {
  /** The file where the diagnostic was found */
  file: string;
  /** The line number */
  line: number;
  /** The column */
  column: number;
  /** The diagnostic message */
  message: string;
  /** The severity: error, warning, info */
  severity: 'error' | 'warning' | 'info';
  /** The code/label of the diagnostic */
  code: string;
}

export interface TemplateDiagnostic extends YamlDiagnostic {
  /** The template path that has the issue */
  templatePath: string;
  /** The depth level where this issue was found */
  depth: number;
}

export interface ParameterDiagnostic extends YamlDiagnostic {
  /** The parameter name that has the issue */
  parameterName: string;
  /** The parameter type that was expected */
  expectedType: string;
  /** The parameter type that was found */
  foundType: string;
}

export interface VariableDiagnostic extends YamlDiagnostic {
  /** The variable name that has the issue */
  variableName: string;
  /** Whether the variable is missing or shadowed */
  issue: 'missing' | 'shadowed' | 'undefined';
}
