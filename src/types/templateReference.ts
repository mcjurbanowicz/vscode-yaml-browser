export interface TemplateReference {
  /** The file that contains the template reference */
  sourceFile: string;
  /** The line number where the template reference appears */
  line: number;
  /** The column where the template reference appears */
  column: number;
  /** The path to the template file (relative to workspace root) */
  path: string;
  /** Parameters passed to this template invocation */
  parameters: Record<string, unknown> | null;
  /** The depth level in the template hierarchy (0 = root) */
  depth: number;
  /** Unique identifier for this reference */
  id: string;
}

export interface TemplateNode {
  /** The path to this template file */
  path: string;
  /** The depth level in the hierarchy */
  depth: number;
  /** References to child templates (templates referenced by this file) */
  children: TemplateNode[];
  /** Parameters passed to this template */
  parameters: Record<string, unknown> | null;
  /** The line number where this template is referenced */
  referencedLine: number;
  /** Whether this template is the root file */
  isRoot: boolean;
}

export interface TemplateReferenceTree {
  /** The root template file */
  root: string;
  /** The complete tree of template references */
  tree: TemplateNode;
  /** All template references found */
  references: TemplateReference[];
  /** Errors encountered during scanning */
  errors: TemplateScanError[];
}

export interface TemplateScanError {
  /** The file where the error occurred */
  file: string;
  /** The line number of the error */
  line: number;
  /** The column of the error */
  column: number;
  /** The error message */
  message: string;
  /** The type of error */
  type: 'error' | 'warning' | 'info';
}
