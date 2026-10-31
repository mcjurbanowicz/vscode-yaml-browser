import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { CachingRegistry } from '../caching/CachingRegistry';
import {
  TemplateReferenceTree,
  TemplateNode,
  TemplateReference,
  TemplateScanError,
} from '../types/templateReference';

export interface ScanConfig {
  maxDepth: number;
  minDepth: number;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface ScanResult {
  tree: TemplateReferenceTree;
  errors: TemplateScanError[];
}

/**
 * Scans a YAML file for template references and builds a reference tree.
 * Traverses template chains up to a configurable depth.
 */
export class TemplateScanner {
  private readonly cache: CachingRegistry;
  private readonly workspaceRoot: string;

  constructor(cache: CachingRegistry, workspaceRoot: string) {
    this.cache = cache;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Scan a file for template references and build a reference tree.
   * @param filePath - Path to the YAML file (relative to workspace root)
   * @param config - Scan configuration
   * @returns The template reference tree and any errors
   */
  async scan(
    filePath: string,
    config: ScanConfig
  ): Promise<ScanResult> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Check cache first
    const cachedEntry = this.cache.getEntry(fullPath);
    if (cachedEntry && await this.isCacheEntryFresh(cachedEntry.fileSignatures)) {
      console.log(
        `[ADO Inspector] Cache hit for: ${filePath} (depth: ${config.maxDepth})`
      );
      return {
        tree: cachedEntry.data,
        errors: cachedEntry.data.errors,
      };
    }
    if (cachedEntry) {
      this.cache.delete(fullPath);
    }

    // Not in cache, need to build
    try {
      const result = await this.scanFile(fullPath, config);
      if (result.errors.length > 0) {
        // Don't cache if there were errors
        return { tree: result, errors: result.errors };
      }
      // Store in cache
      this.cache.set(fullPath, result, await this.getFileSignatures(result));
      return { tree: result, errors: result.errors };
    } catch (error) {
      const scanErrors: TemplateScanError[] = [
        {
          file: filePath,
          line: 1,
          column: 1,
          message: `Failed to scan file: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error' as const,
        },
      ];
      return {
        tree: {
          root: filePath,
          tree: {
            path: filePath,
            depth: 0,
            isRoot: true,
            children: [],
            parameters: null,
            referencedLine: 0,
          },
          references: [],
          errors: scanErrors,
        },
        errors: scanErrors,
      };
    }
  }

  private async isCacheEntryFresh(
    fileSignatures: Record<string, number> | undefined
  ): Promise<boolean> {
    if (!fileSignatures) {
      return false;
    }
    const entries = Object.entries(fileSignatures);
    if (entries.length === 0) {
      return false;
    }

    for (const [filePath, cachedMtime] of entries) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs !== cachedMtime) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return true;
  }

  private async getFileSignatures(
    tree: TemplateReferenceTree
  ): Promise<Record<string, number>> {
    const filePaths = new Set([
      tree.root,
      ...tree.references.map((reference) => reference.path),
    ]);
    const signatures: Record<string, number> = {};
    for (const filePath of filePaths) {
      const stat = await fs.stat(filePath);
      signatures[filePath] = stat.mtimeMs;
    }
    return signatures;
  }

  /**
   * Recursively scan a file and its referenced templates.
   */
  private async scanFile(
    filePath: string,
    config: ScanConfig,
    currentDepth: number = 0,
    ancestors: Set<string> = new Set<string>()
  ): Promise<TemplateReferenceTree> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      return {
        root: filePath,
        tree: {
          path: filePath,
          depth: 0,
          isRoot: true,
          children: [],
          parameters: null,
          referencedLine: 0,
        },
        references: [],
        errors: [
          {
            file: filePath,
            line: 1,
            column: 1,
            message: `File not found: ${fullPath}`,
            type: 'error' as const,
          },
        ],
      };
    }

    // Read the file
    let content: string;
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      return {
        root: filePath,
        tree: {
          path: filePath,
          depth: 0,
          isRoot: true,
          children: [],
          parameters: null,
          referencedLine: 0,
        },
        references: [],
        errors: [
          {
            file: filePath,
            line: 1,
            column: 1,
            message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
            type: 'error' as const,
          },
        ],
      };
    }

    // Parse every YAML document so multi-document pipeline files are scanned.
    let documents: unknown[];
    const errors: TemplateScanError[] = [];
    try {
      const parsedDocuments = yaml.parseAllDocuments(content, {
        prettyErrors: true,
      });
      documents = parsedDocuments.map((document) => {
        for (const parseError of document.errors) {
          const position = parseError.linePos?.[0];
          errors.push({
            file: fullPath,
            line: position?.line ?? 1,
            column: position?.col ?? 1,
            message: parseError.message,
            type: 'error',
          });
        }
        return document.toJS();
      });
    } catch (error) {
      return {
        root: fullPath,
        tree: {
          path: fullPath,
          depth: currentDepth,
          isRoot: true,
          children: [],
          parameters: null,
          referencedLine: 0,
        },
        references: [],
        errors: [...errors,
          {
            file: fullPath,
            line: 1,
            column: 1,
            message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
            type: 'error' as const,
          },
        ],
      };
    }

    const tree: TemplateNode = {
      path: fullPath,
      depth: currentDepth,
      isRoot: currentDepth === 0,
      children: [],
      parameters: this.extractParameters(documents[0]),
      referencedLine: 0,
    };
    const templateReferences = documents.flatMap((document) =>
      this.findTemplateReferences(
        document,
        fullPath,
        currentDepth,
        config.maxDepth,
        config.minDepth,
        content
      )
    );
    const currentAncestors = new Set(ancestors).add(fullPath);

    if (currentDepth < config.maxDepth) {
      for (const reference of [...templateReferences]) {
        if (reference.parameterSyntaxError) {
          errors.push({
            file: reference.sourceFile,
            line: reference.line,
            column: reference.column,
            message: reference.parameterSyntaxError,
            type: 'error',
          });
        }
        if (currentAncestors.has(reference.path)) {
          errors.push({
            file: fullPath,
            line: reference.line,
            column: reference.column,
            message: `Circular template reference: ${reference.path}`,
            type: 'error',
          });
          continue;
        }

        const childResult = await this.scanFile(
          reference.path,
          config,
          currentDepth + 1,
          currentAncestors
        );
        errors.push(
          ...this.validateTemplateParameters(reference, childResult.tree.parameters)
        );
        childResult.tree.depth = currentDepth + 1;
        childResult.tree.isRoot = false;
        childResult.tree.parameters = reference.parameters;
        childResult.tree.referencedLine = reference.line;
        tree.children.push(childResult.tree);
        templateReferences.push(...childResult.references);
        errors.push(...childResult.errors);
      }
    }

    return {
      root: fullPath,
      tree,
      references: templateReferences,
      errors,
    };
  }

  /**
   * Recursively build the tree from a node.
   */
  private buildTree(
    node: TemplateNode,
    tree: TemplateNode,
    nodeMap: Map<string, TemplateNode>,
    currentDepth: number
  ): void {
    if (currentDepth >= 0) {
      tree.children.push(node);
    }

    // Recurse into children
    for (const child of node.children) {
      this.buildTree(child, tree, nodeMap, currentDepth - 1);
    }
  }

  /**
   * Find all template references in a YAML document.
   */
  private findTemplateReferences(
    doc: unknown,
    filePath: string,
    currentDepth: number,
    maxDepth: number,
    minDepth: number,
    sourceContent: string
  ): TemplateReference[] {
    const references: TemplateReference[] = [];
    const lines = sourceContent.split(/\r?\n/);
    let searchFromLine = 0;

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') {
        return;
      }

      const objectValue = value as Record<string, unknown>;
      const templatePath = objectValue.template;
      if (typeof templatePath === 'string' && !templatePath.includes('@')) {
        const resolvedPath = this.resolveTemplatePath(
          templatePath,
          filePath,
          currentDepth
        );
        const location = this.findTemplateLocation(lines, templatePath, searchFromLine);
        if (location) {
          searchFromLine = location.line;
        }
        references.push({
          sourceFile: filePath,
          line: location?.line ?? 1,
          column: location?.column ?? 1,
          path: resolvedPath,
          parameters: this.extractParametersFromContext(objectValue),
          parameterSyntaxError:
            objectValue.parameter !== undefined && objectValue.parameters === undefined
              ? 'Azure DevOps template invocations use "parameters:", not "parameter:".'
              : undefined,
          depth: currentDepth + 1,
          id: `${filePath}|${currentDepth + 1}|${resolvedPath}`,
        });
      }

      for (const [key, child] of Object.entries(objectValue)) {
        if (key !== 'template') {
          visit(child);
        }
      }
    };

    visit(doc);

    return references;
  }

  private findTemplateLocation(
    lines: string[],
    templatePath: string,
    startLine: number
  ): { line: number; column: number } | undefined {
    const templateLine = /^\s*(?:-\s*)?template:\s*(?:(['"])(.*?)\1|([^\s#]+))/;
    for (let index = startLine; index < lines.length; index++) {
      const match = templateLine.exec(lines[index]);
      const value = match?.[2] ?? match?.[3];
      if (value === templatePath && match) {
        return {
          line: index + 1,
          column: lines[index].indexOf(value) + 1,
        };
      }
    }
    return undefined;
  }

  private validateTemplateParameters(
    reference: TemplateReference,
    definitions: Record<string, unknown> | null
  ): TemplateScanError[] {
    if (!definitions) {
      return [];
    }

    const diagnostics: TemplateScanError[] = [];
    const passed = reference.parameters ?? {};
    for (const parameterName of Object.keys(passed)) {
      if (!(parameterName in definitions)) {
        diagnostics.push({
          file: reference.sourceFile,
          line: reference.line,
          column: reference.column,
          message: `Template does not declare parameter "${parameterName}".`,
          type: 'error',
        });
      }
    }

    for (const [parameterName, definition] of Object.entries(definitions)) {
      if (!definition || typeof definition !== 'object') {
        continue;
      }
      const parameterDefinition = definition as Record<string, unknown>;
      const hasDefault = Object.prototype.hasOwnProperty.call(parameterDefinition, 'default');
      if (!hasDefault && !(parameterName in passed)) {
        diagnostics.push({
          file: reference.sourceFile,
          line: reference.line,
          column: reference.column,
          message: `Required template parameter "${parameterName}" is not supplied.`,
          type: 'error',
        });
        continue;
      }

      if (!(parameterName in passed)) {
        continue;
      }
      const expectedType = parameterDefinition.type;
      const actualValue = passed[parameterName];
      const isValid = expectedType === 'string'
        ? typeof actualValue === 'string'
        : expectedType === 'number'
          ? typeof actualValue === 'number'
          : expectedType === 'boolean'
            ? typeof actualValue === 'boolean'
            : expectedType === 'object'
              ? typeof actualValue === 'object' && actualValue !== null
              : true;
      if (!isValid) {
        diagnostics.push({
          file: reference.sourceFile,
          line: reference.line,
          column: reference.column,
          message: `Template parameter "${parameterName}" expects ${String(expectedType)}.`,
          type: 'error',
        });
      }

      const values = parameterDefinition.values;
      if (Array.isArray(values) && !values.includes(actualValue)) {
        diagnostics.push({
          file: reference.sourceFile,
          line: reference.line,
          column: reference.column,
          message: `Value for template parameter "${parameterName}" is not one of its declared values.`,
          type: 'error',
        });
      }
    }

    return diagnostics;
  }

  /**
   * Extract parameters from a YAML document.
   */
  private extractParameters(doc: unknown): Record<string, unknown> | null {
    if (!doc || typeof doc !== 'object') {
      return null;
    }

    const docObj = doc as Record<string, unknown>;
    if (!docObj.parameters || !Array.isArray(docObj.parameters)) {
      return null;
    }

    const params: Record<string, unknown> = {};
    for (const param of docObj.parameters) {
      if (param && typeof param === 'object') {
        const paramName = (param as Record<string, unknown>).name;
        if (typeof paramName === 'string') {
          params[paramName] = param;
        }
      }
    }

    return params;
  }

  /**
   * Extract parameters from the template invocation context.
   */
  private extractParametersFromContext(context: unknown): Record<string, unknown> | null {
    if (!context || typeof context !== 'object') {
      return null;
    }

    const contextObj = context as Record<string, unknown>;
    const rawParameters = contextObj.parameters ?? contextObj.parameter;
    if (!rawParameters || typeof rawParameters !== 'object') {
      return null;
    }

    if (!Array.isArray(rawParameters)) {
      return rawParameters as Record<string, unknown>;
    }

    const params: Record<string, unknown> = {};
    for (const parameter of rawParameters) {
      if (parameter && typeof parameter === 'object') {
        const name = (parameter as Record<string, unknown>).name;
        if (typeof name === 'string') {
          params[name] = parameter;
        }
      }
    }
    return params;
  }

  /**
   * Resolve a template path relative to the workspace root.
   */
  private resolveTemplatePath(
    templatePath: string,
    sourceFile: string,
    depth: number
  ): string {
    return path.isAbsolute(templatePath)
      ? path.normalize(templatePath)
      : path.resolve(path.dirname(sourceFile), templatePath);
  }

  /**
   * Scan all YAML files in a directory.
   */
  async scanDirectory(
    rootPath: string,
    config: ScanConfig
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(rootPath, entry.name);

        if (entry.isDirectory()) {
          if (this.matchesAnyPattern(`${path.relative(rootPath, fullPath)}/`, config.excludePatterns)) {
            continue;
          }
          const subResults = await this.scanDirectory(fullPath, config);
          results.push(...subResults);
        } else if (
          this.matchesAnyPattern(entry.name, config.includePatterns) &&
          !this.matchesAnyPattern(path.relative(rootPath, fullPath), config.excludePatterns)
        ) {
          const result = await this.scan(fullPath, config);
          results.push(result);
        }
      }
    } catch (error) {
      console.warn(
        `[ADO Inspector] Failed to scan directory ${rootPath}: ${error}`
      );
    }

    return results;
  }

  private matchesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      const optionalPrefix = pattern.startsWith('**/');
      const normalizedPattern = pattern.replace(/^\*\*\//, '');
      const expression = normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');
      return new RegExp(`^${optionalPrefix ? '(?:.*/)?' : ''}${expression}$`).test(
        value.replace(/\\/g, '/')
      );
    });
  }
}
