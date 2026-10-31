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
    if (this.cache.has(fullPath)) {
      console.log(
        `[ADO Inspector] Cache hit for: ${filePath} (depth: ${config.maxDepth})`
      );
      return {
        tree: this.cache.get(fullPath)! as TemplateReferenceTree,
        errors: [],
      };
    }

    // Not in cache, need to build
    try {
      const result = await this.scanFile(fullPath, config);
      if (result.errors.length > 0) {
        // Don't cache if there were errors
        return result;
      }
      // Store in cache
      this.cache.set(fullPath, result.tree);
      return result;
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

  /**
   * Recursively scan a file and its referenced templates.
   */
  private async scanFile(
    filePath: string,
    config: ScanConfig
  ): Promise<TemplateReferenceTree> {
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    // Check if file exists
    if (!(await fs.existsSync(fullPath))) {
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

    // Parse the YAML
    let document: unknown;
    try {
      document = yaml.parse(content, {
        prettyErrors: true,
      });
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
            message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
            type: 'error' as const,
          },
        ],
      };
    }

    // Extract parameters from the file
    const parameters = this.extractParameters(document);

    // Build the tree node for this file
    const node: TemplateNode = {
      path: filePath,
      depth: 0,
      isRoot: true,
      children: [],
      parameters,
      referencedLine: 0,
    };

    // Find template references
    const templateReferences = this.findTemplateReferences(
      document,
      filePath,
      0,
      config.maxDepth,
      config.minDepth
    );

    // Build the tree
    const tree: TemplateNode = {
      path: filePath,
      depth: 0,
      isRoot: true,
      children: [],
      parameters,
      referencedLine: 0,
    };

    // Create a map of template paths to their nodes
    const nodeMap = new Map<string, TemplateNode>();
    nodeMap.set(filePath, node);

    // Process each template reference
    for (const ref of templateReferences) {
      const childNode = nodeMap.get(ref.path);
      if (childNode) {
        node.children.push(childNode);
      }
    }

    // Build the tree recursively
    this.buildTree(node, tree, nodeMap, config.maxDepth);

    return {
      root: filePath,
      tree: tree,
      references: templateReferences,
      errors: [],
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
    minDepth: number
  ): TemplateReference[] {
    const references: TemplateReference[] = [];

    if (!doc || typeof doc !== 'object') {
      return references;
    }

    const docObj = doc as Record<string, unknown>;

    // Check for template references at this level
    const templateValues = this.findTemplateValues(docObj);

    for (const templatePath of templateValues) {
      const relativePath = this.resolveTemplatePath(
        templatePath,
        filePath,
        currentDepth
      );

      if (!relativePath) {
        continue;
      }

      // Get parameters passed to this template
      const parameters = this.extractParametersFromContext(docObj);

      const ref: TemplateReference = {
        sourceFile: filePath,
        line: 0, // Would need line tracking for full accuracy
        column: 0,
        path: relativePath,
        parameters: parameters || null,
        depth: currentDepth,
        id: `${filePath}|${currentDepth}|${relativePath}`,
      };

      references.push(ref);
    }

    // Recurse into children
    const keys = Object.keys(docObj);
    for (const key of keys) {
      if (Array.isArray(docObj[key])) {
        // If it's an array, check each element
        for (const item of docObj[key]) {
          references.push(...this.findTemplateReferences(item, filePath, currentDepth, maxDepth, minDepth));
        }
      } else if (typeof docObj[key] === 'object' && docObj[key] !== null) {
        // Recurse into objects
        references.push(...this.findTemplateReferences(docObj[key], filePath, currentDepth, maxDepth, minDepth));
      }
    }

    return references;
  }

  /**
   * Find template values (strings starting with . or /) in an object.
   */
  private findTemplateValues(obj: Record<string, unknown>): string[] {
    const values: string[] = [];

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value === 'string') {
        // Check if this looks like a template path
        if (value.startsWith('./') || value.startsWith('../')) {
          values.push(value);
        }
      } else if (Array.isArray(value)) {
        values.push(...this.findTemplateValues(obj as Record<string, unknown>));
      } else if (typeof value === 'object' && value !== null) {
        values.push(...this.findTemplateValues(value as Record<string, unknown>));
      }
    }

    return values;
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
        if (paramName) {
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
    if (!contextObj.parameters || !Array.isArray(contextObj.parameters)) {
      return null;
    }

    const params: Record<string, unknown> = {};
    for (const param of contextObj.parameters) {
      if (param && typeof param === 'object') {
        const paramName = (param as Record<string, unknown>).name;
        if (paramName) {
          params[paramName] = param;
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
  ): string | null {
    // Remove any leading "./" or "../" for consistent handling
    const normalizedPath = templatePath.replace(/^\.\//, '').replace(/^\.\.\//, '');

    // For simplicity, resolve relative to workspace root
    // In a more sophisticated implementation, you'd resolve relative to the source file
    const resolvedPath = path.resolve(this.workspaceRoot, normalizedPath);

    // Normalize the path
    const normalizedResolved = resolvedPath.replace(/\\/g, '/');

    return normalizedResolved;
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

        // Check if file matches include patterns
        const matchesInclude = config.includePatterns.some((pattern) =>
          entry.name.match(pattern)
        );

        if (!matchesInclude) {
          continue;
        }

        // Check if file matches exclude patterns
        const matchesExclude = config.excludePatterns.some((pattern) =>
          entry.name.match(pattern)
        );

        if (matchesExclude) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          const subResults = await this.scanDirectory(fullPath, config);
          results.push(...subResults);
        } else {
          // It's a file
          const result = await this.scan(entry.name, config);
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
}
