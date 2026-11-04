import * as yaml from 'yaml';
import { YamlDiagnostic } from '../types/diagnostic';

export class YamlValidator {
  validate(content: string, filePath: string): YamlDiagnostic[] {
    const diagnostics: YamlDiagnostic[] = [];

    try {
      const documents = yaml.parseAllDocuments(content, {
        prettyErrors: true,
      });

      for (const document of documents) {
        for (const error of document.errors) {
          const position = error.linePos?.[0];
          diagnostics.push({
            file: filePath,
            line: position?.line ?? 1,
            column: position?.col ?? 1,
            message: error.message,
            severity: 'error',
            code: 'PARSE_ERROR',
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        file: filePath,
        line: 1,
        column: 1,
        message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        code: 'PARSE_ERROR',
      });
    }

    return diagnostics;
  }
}
