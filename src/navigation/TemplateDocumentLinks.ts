import * as path from 'path';
import * as vscode from 'vscode';

const templateLine = /^(\s*(?:-\s*)?template:\s*)(?:(['"])([^'"]+)\2|([^\s#]+))\s*(?:#.*)?$/;

export class TemplateDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];

    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const match = templateLine.exec(line);
      if (match) {
        const reference = (match[3] ?? match[4] ?? '').trim();
        if (reference && !reference.includes('${{') && !reference.includes('@')) {
          const quoted = match[2] !== undefined;
          const referenceColumn = match[1].length + (quoted ? 1 : 0);
          const range = new vscode.Range(
            new vscode.Position(lineNumber, referenceColumn),
            new vscode.Position(lineNumber, referenceColumn + reference.length)
          );
          const targetPath = path.resolve(
            path.dirname(document.uri.fsPath),
            reference
          );
          links.push(
            new vscode.DocumentLink(
              range,
              vscode.Uri.file(targetPath)
            )
          );
        }
      }
    }

    return links;
  }
}
