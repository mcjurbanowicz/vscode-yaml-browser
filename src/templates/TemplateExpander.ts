import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';

type ParameterValues = Record<string, unknown>;

const parameterExpression = /^\$\{\{\s*parameters\.([A-Za-z_][\w]*)\s*\}\}$/;
const embeddedParameterExpression = /\$\{\{\s*parameters\.([A-Za-z_][\w]*)\s*\}\}/g;

export class TemplateExpander {
  async expand(filePath: string, content: string): Promise<string> {
    const expanded = await this.expandFile(
      path.resolve(filePath),
      content,
      {},
      new Set()
    );
    return yaml.stringify(expanded);
  }

  private async expandFile(
    filePath: string,
    content: string,
    suppliedParameters: ParameterValues,
    ancestors: Set<string>
  ): Promise<unknown> {
    const normalizedPath = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
    if (ancestors.has(normalizedPath)) {
      throw new Error(`Circular template reference: ${filePath}`);
    }

    const documents = yaml.parseAllDocuments(content, { prettyErrors: true });
    const errors = documents.flatMap((document) => document.errors);
    if (errors.length > 0) {
      throw new Error(
        `Could not parse ${filePath}: ${errors.map((error) => error.message).join('; ')}`
      );
    }
    if (documents.every((document) => document.contents === null)) {
      throw new Error(`No YAML content found in ${filePath}.`);
    }

    const root = this.combineDocuments(
      documents
        .filter((document) => document.contents !== null)
        .map((document) => document.toJS())
    );
    const parameterValues = this.resolveParameters(root, suppliedParameters);
    const nextAncestors = new Set(ancestors).add(normalizedPath);

    if (this.isMapping(root) && this.isMapping(root.extends)) {
      const extendedTemplate = await this.expandTemplateReference(
        root.extends,
        filePath,
        parameterValues,
        nextAncestors
      );
      if (!this.isMapping(extendedTemplate)) {
        throw new Error(`The extends template in ${filePath} must contain a YAML mapping.`);
      }

      const pipeline = { ...root };
      delete pipeline.extends;
      const expandedPipeline = await this.expandValue(
        pipeline,
        filePath,
        parameterValues,
        nextAncestors
      );
      if (!this.isMapping(expandedPipeline)) {
        throw new Error(`The pipeline in ${filePath} must contain a YAML mapping.`);
      }
      return this.mergeExtendedPipeline(extendedTemplate, expandedPipeline);
    }

    return this.expandValue(root, filePath, parameterValues, nextAncestors);
  }

  private isMapping(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private mergeExtendedPipeline(
    template: Record<string, unknown>,
    pipeline: Record<string, unknown>
  ): Record<string, unknown> {
    const merged = { ...template };
    delete merged.parameters;

    for (const [key, value] of Object.entries(pipeline)) {
      const existing = merged[key];
      if (
        ['stages', 'jobs', 'steps'].includes(key) &&
        Array.isArray(existing) &&
        Array.isArray(value)
      ) {
        merged[key] = [...existing, ...value];
      } else if (key === 'variables' && this.isMapping(existing) && this.isMapping(value)) {
        merged[key] = { ...existing, ...value };
      } else if (key === 'variables' && Array.isArray(existing) && Array.isArray(value)) {
        merged[key] = [...existing, ...value];
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  private combineDocuments(documents: unknown[]): unknown {
    if (documents.length === 1) {
      return documents[0];
    }

    const combined: Record<string, unknown> = {};
    for (const document of documents) {
      if (!document || typeof document !== 'object' || Array.isArray(document)) {
        throw new Error('Multi-document templates must contain YAML mappings.');
      }
      for (const [key, value] of Object.entries(document)) {
        const existing = combined[key];
        combined[key] = Array.isArray(existing) && Array.isArray(value)
          ? [...existing, ...value]
          : value;
      }
    }
    return combined;
  }

  private resolveParameters(
    root: unknown,
    suppliedParameters: ParameterValues
  ): ParameterValues {
    const values: ParameterValues = {};
    if (root && typeof root === 'object' && !Array.isArray(root)) {
      const definitions = (root as Record<string, unknown>).parameters;
      if (Array.isArray(definitions)) {
        for (const definition of definitions) {
          if (!definition || typeof definition !== 'object') {
            continue;
          }
          const item = definition as Record<string, unknown>;
          if (typeof item.name === 'string' && 'default' in item) {
            values[item.name] = this.resolveValue(item.default, values);
          }
        }
      }
    }

    for (const [name, value] of Object.entries(suppliedParameters)) {
      values[name] = this.resolveValue(value, values);
    }
    return values;
  }

  private async expandValue(
    value: unknown,
    filePath: string,
    parameters: ParameterValues,
    ancestors: Set<string>,
    sectionContext?: string
  ): Promise<unknown> {
    if (typeof value === 'string') {
      return this.resolveValue(value, parameters);
    }
    if (Array.isArray(value)) {
      const expanded: unknown[] = [];
      for (const item of value) {
        const result = await this.expandValue(
          item,
          filePath,
          parameters,
          ancestors,
          sectionContext
        );
        if (Array.isArray(result)) {
          expanded.push(...result);
        } else {
          expanded.push(result);
        }
      }
      return expanded;
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.template === 'string') {
      return this.expandTemplateReference(
        objectValue,
        filePath,
        parameters,
        ancestors,
        sectionContext
      );
    }

    const expanded: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(objectValue)) {
      const childSectionContext = ['stages', 'jobs', 'steps'].includes(key)
        ? key
        : sectionContext;
      expanded[key] = await this.expandValue(
        child,
        filePath,
        parameters,
        ancestors,
        childSectionContext
      );
    }
    return expanded;
  }

  private async expandTemplateReference(
    reference: Record<string, unknown>,
    sourcePath: string,
    parameters: ParameterValues,
    ancestors: Set<string>,
    sectionContext?: string
  ): Promise<unknown> {
    const templatePath = this.resolveValue(reference.template, parameters);
    if (typeof templatePath !== 'string' || templatePath.includes('${{')) {
      throw new Error(`Cannot resolve dynamic template path in ${sourcePath}.`);
    }
    if (templatePath.includes('@') || templatePath.startsWith('$(')) {
      throw new Error(`Only local template paths can be expanded: ${templatePath}`);
    }

    const resolvedPath = path.resolve(path.dirname(sourcePath), templatePath);
    let templateContent: string;
    try {
      templateContent = await fs.readFile(resolvedPath, 'utf8');
    } catch (error) {
      throw new Error(
        `Could not read template ${templatePath} referenced from ${sourcePath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    const suppliedParameters = this.parameterObject(
      this.resolveValue(reference.parameters, parameters)
    );
    const expandedTemplate = await this.expandFile(
      resolvedPath,
      templateContent,
      suppliedParameters,
      ancestors
    );
    if (
      sectionContext &&
      expandedTemplate &&
      typeof expandedTemplate === 'object' &&
      !Array.isArray(expandedTemplate)
    ) {
      const matchingSection = (expandedTemplate as Record<string, unknown>)[sectionContext];
      if (matchingSection !== undefined) {
        return matchingSection;
      }
    }
    return expandedTemplate;
  }

  private parameterObject(value: unknown): ParameterValues {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as ParameterValues;
  }

  private resolveValue(
    value: unknown,
    parameters: ParameterValues,
    resolving = new Set<string>()
  ): unknown {
    if (typeof value === 'string') {
      const exactMatch = parameterExpression.exec(value);
      if (exactMatch && Object.hasOwn(parameters, exactMatch[1])) {
        if (resolving.has(exactMatch[1])) {
          return value;
        }
        return this.resolveValue(
          parameters[exactMatch[1]],
          parameters,
          new Set(resolving).add(exactMatch[1])
        );
      }
      return value.replace(embeddedParameterExpression, (expression, name: string) => {
        if (!Object.hasOwn(parameters, name) || resolving.has(name)) {
          return expression;
        }
        const parameterValue = this.resolveValue(
          parameters[name],
          parameters,
          new Set(resolving).add(name)
        );
        return typeof parameterValue === 'string'
          ? parameterValue
          : JSON.stringify(parameterValue);
      });
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item, parameters, resolving));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          this.resolveValue(child, parameters, resolving),
        ])
      );
    }
    return value;
  }
}
