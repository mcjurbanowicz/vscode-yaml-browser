import * as yaml from 'yaml';

type ScenarioInputKind = 'parameter' | 'variable';

export interface ScenarioInput {
  key: string;
  name: string;
  kind: ScenarioInputKind;
  defaultValue?: unknown;
  candidates: unknown[];
}

export interface DecisionPathResult {
  mermaid: string;
  unresolvedConditions: string[];
}

type Expression =
  | { kind: 'literal'; value: unknown }
  | { kind: 'reference'; path: string }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'call'; name: string; arguments: Expression[] };

type Token =
  | { kind: 'identifier'; value: string }
  | { kind: 'literal'; value: unknown }
  | { kind: 'punctuation'; value: string };

const unknownValue = Symbol('unknown');
type EvaluatedValue = unknown | typeof unknownValue;

const inputReference = /\b(parameters|variables)(?:\.([A-Za-z_][\w.-]*)|\[['"]([^'"]+)['"]\])/gi;
const conditionWrapper = /^\s*\$\{\{\s*(if|elseif|else)\s*([\s\S]*?)\s*\}\}\s*$/i;

interface ConditionalKey {
  kind: 'if' | 'elseif' | 'else';
  expression: string;
}

function conditionalKey(key: string): ConditionalKey | undefined {
  const match = conditionWrapper.exec(key);
  if (!match) {
    return undefined;
  }
  return {
    kind: match[1].toLowerCase() as ConditionalKey['kind'],
    expression: match[2].trim(),
  };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let value = '';
      index++;
      let closed = false;
      while (index < source.length) {
        if (source[index] === quote) {
          if (quote === "'" && source[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index++;
          closed = true;
          break;
        }
        value += source[index++];
      }
      if (!closed) {
        throw new Error('Unterminated string literal.');
      }
      tokens.push({ kind: 'literal', value });
      continue;
    }
    if (/[0-9]/.test(character) || (character === '-' && /[0-9]/.test(source[index + 1] ?? ''))) {
      const match = /^-?\d+(?:\.\d+)?/.exec(source.slice(index));
      if (!match) {
        throw new Error(`Invalid number at character ${index + 1}.`);
      }
      tokens.push({ kind: 'literal', value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const match = /^[A-Za-z_$][\w.$-]*/.exec(source.slice(index));
      if (!match) {
        throw new Error(`Invalid identifier at character ${index + 1}.`);
      }
      const value = match[0];
      const normalized = value.toLowerCase();
      if (normalized === 'true' || normalized === 'false' || normalized === 'null') {
        tokens.push({
          kind: 'literal',
          value: normalized === 'null' ? null : normalized === 'true',
        });
      } else {
        tokens.push({ kind: 'identifier', value });
      }
      index += value.length;
      continue;
    }
    if ('(),[].'.includes(character)) {
      tokens.push({ kind: 'punctuation', value: character });
      index++;
      continue;
    }
    throw new Error(`Unsupported character "${character}" at character ${index + 1}.`);
  }
  return tokens;
}

class ExpressionParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expression {
    const expression = this.parsePrimary();
    if (this.index !== this.tokens.length) {
      throw new Error(`Unexpected token "${this.currentValue()}".`);
    }
    return expression;
  }

  private parsePrimary(): Expression {
    const token = this.take();
    if (!token) {
      throw new Error('Expected an expression.');
    }

    let expression: Expression;
    if (token.kind === 'literal') {
      expression = { kind: 'literal', value: token.value };
    } else if (token.kind === 'identifier') {
      if (this.consume('(')) {
        const arguments_: Expression[] = [];
        if (!this.consume(')')) {
          do {
            arguments_.push(this.parsePrimary());
          } while (this.consume(','));
          this.expect(')');
        }
        expression = { kind: 'call', name: token.value, arguments: arguments_ };
      } else {
        expression = { kind: 'reference', path: token.value };
      }
    } else if (token.value === '(') {
      expression = this.parsePrimary();
      this.expect(')');
    } else {
      throw new Error(`Unexpected token "${token.value}".`);
    }

    while (this.consume('[')) {
      const index = this.parsePrimary();
      this.expect(']');
      expression = { kind: 'index', target: expression, index };
    }
    return expression;
  }

  private take(): Token | undefined {
    return this.tokens[this.index++];
  }

  private consume(value: string): boolean {
    if (this.currentValue() !== value) {
      return false;
    }
    this.index++;
    return true;
  }

  private expect(value: string): void {
    if (!this.consume(value)) {
      throw new Error(`Expected "${value}".`);
    }
  }

  private currentValue(): string | undefined {
    const token = this.tokens[this.index];
    return token?.kind === 'punctuation' || token?.kind === 'identifier'
      ? token.value
      : undefined;
  }
}

function unwrapExpression(source: string): string {
  const trimmed = source.trim();
  const compileTime = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/.exec(trimmed);
  if (compileTime) {
    const conditional = /^if\s+([\s\S]*)$/i.exec(compileTime[1]);
    return conditional?.[1] ?? compileTime[1];
  }
  const runtime = /^\$\[\s*([\s\S]*?)\s*\]$/.exec(trimmed);
  return runtime?.[1] ?? trimmed;
}

function parseExpression(source: string): Expression {
  return new ExpressionParser(tokenize(unwrapExpression(source))).parse();
}

function walkExpressions(
  value: unknown,
  visit: (source: string) => void
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkExpressions(item, visit);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'condition' && typeof child === 'string') {
      visit(child);
    }
    if (key.startsWith('${{') && conditionalKey(key)?.kind !== 'else' &&
      conditionalKey(key) !== undefined) {
      visit(key);
    }
    walkExpressions(child, visit);
  }
}

function definitionsFrom(root: unknown): Map<string, ScenarioInput> {
  const inputs = new Map<string, ScenarioInput>();
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return inputs;
  }
  const object = root as Record<string, unknown>;
  const parameters = object.parameters;
  if (Array.isArray(parameters)) {
    for (const value of parameters) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const definition = value as Record<string, unknown>;
      if (typeof definition.name !== 'string') {
        continue;
      }
      const input: ScenarioInput = {
        key: `parameters.${definition.name}`,
        name: definition.name,
        kind: 'parameter',
        candidates: [],
      };
      if ('default' in definition) {
        input.defaultValue = definition.default;
        input.candidates.push(definition.default);
      }
      if (Array.isArray(definition.values)) {
        input.candidates.push(...definition.values);
      }
      inputs.set(input.key.toLowerCase(), input);
    }
  }

  const variables = object.variables;
  if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
    for (const [name, value] of Object.entries(variables)) {
      const variableValue = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).value
        : value;
      if (
        typeof variableValue !== 'string' &&
        typeof variableValue !== 'number' &&
        typeof variableValue !== 'boolean'
      ) {
        continue;
      }
      inputs.set(`variables.${name}`.toLowerCase(), {
        key: `variables.${name}`,
        name,
        kind: 'variable',
        defaultValue: variableValue,
        candidates: [variableValue],
      });
    }
  } else if (Array.isArray(variables)) {
    for (const value of variables) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const definition = value as Record<string, unknown>;
      if (typeof definition.name !== 'string' || !('value' in definition)) {
        continue;
      }
      inputs.set(`variables.${definition.name}`.toLowerCase(), {
        key: `variables.${definition.name}`,
        name: definition.name,
        kind: 'variable',
        defaultValue: definition.value,
        candidates: [definition.value],
      });
    }
  }
  return inputs;
}

function expressionReferences(expression: Expression, references: Set<string>): void {
  if (expression.kind === 'reference') {
    const match = /^(parameters|variables)\.(.+)$/i.exec(expression.path);
    if (match) {
      references.add(`${match[1].toLowerCase()}.${match[2]}`.toLowerCase());
    }
  } else if (expression.kind === 'index') {
    if (expression.target.kind === 'reference' &&
      expression.target.path.toLowerCase() === 'variables' &&
      expression.index.kind === 'literal' &&
      typeof expression.index.value === 'string') {
      references.add(`variables.${expression.index.value}`.toLowerCase());
    } else {
      expressionReferences(expression.target, references);
      expressionReferences(expression.index, references);
    }
  } else if (expression.kind === 'call') {
    for (const argument of expression.arguments) {
      expressionReferences(argument, references);
    }
  }
}

function inputKeyFromExpression(expression: Expression): string | undefined {
  if (expression.kind === 'reference') {
    const match = /^(parameters|variables)\.(.+)$/i.exec(expression.path);
    return match ? `${match[1]}.${match[2]}`.toLowerCase() : undefined;
  }
  if (
    expression.kind === 'index' &&
    expression.target.kind === 'reference' &&
    expression.target.path.toLowerCase() === 'variables' &&
    expression.index.kind === 'literal' &&
    typeof expression.index.value === 'string'
  ) {
    return `variables.${expression.index.value}`.toLowerCase();
  }
  return undefined;
}

function comparisonCandidates(expression: Expression, candidates: Map<string, unknown[]>): void {
  if (expression.kind !== 'call') {
    return;
  }
  const name = expression.name.toLowerCase();
  if (['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'in', 'notin', 'startswith', 'endswith', 'contains']
    .includes(name)) {
    for (let index = 0; index < expression.arguments.length; index++) {
      const current = expression.arguments[index];
      const key = inputKeyFromExpression(current);
      if (!key) {
        continue;
      }
      const values = candidates.get(key) ?? [];
      for (let otherIndex = 0; otherIndex < expression.arguments.length; otherIndex++) {
        if (otherIndex === index) {
          continue;
        }
        const other = expression.arguments[otherIndex];
        if (other.kind === 'literal' && !values.some((value) => Object.is(value, other.value))) {
          values.push(other.value);
        }
      }
      candidates.set(key, values);
    }
  }
  for (const argument of expression.arguments) {
    comparisonCandidates(argument, candidates);
  }
}

export function collectScenarioInputs(content: string): ScenarioInput[] {
  const documents = yaml.parseAllDocuments(content, { prettyErrors: true });
  const parseErrors = documents.flatMap((document) => document.errors);
  if (parseErrors.length > 0) {
    throw new Error(`Could not parse YAML: ${parseErrors.map((error) => error.message).join('; ')}`);
  }

  const inputs = new Map<string, ScenarioInput>();
  const expressions: string[] = [];
  for (const document of documents) {
    const rootInputs = definitionsFrom(document.toJS());
    for (const [key, input] of rootInputs) {
      const existing = inputs.get(key);
      if (existing) {
        existing.candidates.push(...input.candidates);
        if (existing.defaultValue === undefined) {
          existing.defaultValue = input.defaultValue;
        }
      } else {
        inputs.set(key, input);
      }
    }
    walkExpressions(document.toJS(), (source) => expressions.push(source));
  }

  const parsedExpressions: Array<{ source: string; expression: Expression }> = [];
  const inputCandidates = new Map<string, unknown[]>();
  const referencedInputs = new Set<string>();
  for (const source of expressions) {
    try {
      const expression = parseExpression(source);
      parsedExpressions.push({ source, expression });
      expressionReferences(expression, referencedInputs);
      comparisonCandidates(expression, inputCandidates);
    } catch {
      for (const match of source.matchAll(inputReference)) {
        referencedInputs.add(`${match[1]}.${match[2] ?? match[3]}`.toLowerCase());
      }
    }
  }

  for (const key of referencedInputs) {
    const [, kind, name] = /^(parameters|variables)\.(.+)$/i.exec(key) ?? [];
    if (!kind || !name) {
      continue;
    }
    const input = inputs.get(key) ?? {
      key: `${kind}.${name}`,
      name,
      kind: kind.toLowerCase() as ScenarioInputKind,
      candidates: [],
    };
    input.candidates.push(...(inputCandidates.get(key) ?? []));
    input.candidates = input.candidates.filter(
      (value, index, values) => values.findIndex((other) => Object.is(other, value)) === index
    );
    if (input.candidates.length > 0) {
      const firstComparable = input.candidates[0];
      if (typeof firstComparable === 'boolean' &&
        !input.candidates.includes(!firstComparable)) {
        input.candidates.push(!firstComparable);
      } else if (typeof firstComparable === 'number' &&
        !input.candidates.includes(firstComparable + 1)) {
        input.candidates.push(firstComparable + 1);
      } else if (typeof firstComparable === 'string' && firstComparable !== '' &&
        !input.candidates.includes('')) {
        input.candidates.push('');
      }
    }
    inputs.set(key, input);
  }

  return [...referencedInputs]
    .map((key) => inputs.get(key))
    .filter((input): input is ScenarioInput => input !== undefined)
    .sort((left, right) =>
      left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name)
    );
}

function getInputValue(
  inputs: Record<string, unknown>,
  namespace: 'parameters' | 'variables',
  name: string
): EvaluatedValue {
  const exactKey = `${namespace}.${name}`;
  if (Object.hasOwn(inputs, exactKey)) {
    return inputs[exactKey];
  }
  const matchingKey = Object.keys(inputs).find(
    (key) => key.toLowerCase() === exactKey.toLowerCase()
  );
  return matchingKey ? inputs[matchingKey] : unknownValue;
}

function asBoolean(value: EvaluatedValue): boolean | typeof unknownValue {
  if (value === unknownValue) {
    return unknownValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  return value !== null && value !== undefined;
}

function comparable(left: unknown, right: unknown): [unknown, unknown] {
  if (typeof left === 'number') {
    const leftNumber = left;
    const rightNumber = Number(right);
    if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
      return [leftNumber, rightNumber];
    }
  }
  if (typeof left === 'boolean') {
    const rightBoolean = typeof right === 'string'
      ? right.toLowerCase() === 'true'
      : Boolean(right);
    return [left, rightBoolean];
  }
  return [String(left ?? '').toLowerCase(), String(right ?? '').toLowerCase()];
}

function resolveReference(
  expression: Expression,
  inputs: Record<string, unknown>
): EvaluatedValue {
  if (expression.kind === 'reference') {
    const match = /^(parameters|variables)\.(.+)$/i.exec(expression.path);
    if (!match) {
      return unknownValue;
    }
    const value = getInputValue(
      inputs,
      match[1].toLowerCase() as 'parameters' | 'variables',
      match[2]
    );
    return match[1].toLowerCase() === 'variables' && value !== unknownValue
      ? String(value ?? '')
      : value;
  }
  if (expression.kind === 'index') {
    if (
      expression.target.kind === 'reference' &&
      expression.target.path.toLowerCase() === 'variables' &&
      expression.index.kind === 'literal' &&
      typeof expression.index.value === 'string'
    ) {
      const value = getInputValue(inputs, 'variables', expression.index.value);
      return value === unknownValue ? value : String(value ?? '');
    }
    return unknownValue;
  }
  return unknownValue;
}

function evaluate(
  expression: Expression,
  inputs: Record<string, unknown>
): EvaluatedValue {
  if (expression.kind === 'literal') {
    return expression.value;
  }
  if (expression.kind === 'reference' || expression.kind === 'index') {
    return resolveReference(expression, inputs);
  }

  const name = expression.name.toLowerCase();
  if (name === 'succeeded' || name === 'succeededorfailed' || name === 'always') {
    return true;
  }
  if (name === 'failed' || name === 'canceled') {
    return false;
  }
  const args = expression.arguments.map((argument) => evaluate(argument, inputs));
  if (args.some((argument) => argument === unknownValue)) {
    return unknownValue;
  }
  const values = args as unknown[];
  const equal = (left: unknown, right: unknown): boolean => {
    const [normalizedLeft, normalizedRight] = comparable(left, right);
    return normalizedLeft === normalizedRight;
  };
  const stringValue = (value: unknown): string => String(value ?? '');
  const first = values[0];

  switch (name) {
    case 'eq': return values.length === 2 ? equal(values[0], values[1]) : unknownValue;
    case 'ne': return values.length === 2 ? !equal(values[0], values[1]) : unknownValue;
    case 'gt':
    case 'ge':
    case 'lt':
    case 'le': {
      if (values.length !== 2) {
        return unknownValue;
      }
      const [left, right] = comparable(values[0], values[1]);
      if (typeof left !== typeof right) {
        return unknownValue;
      }
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right)
          : undefined;
      if (comparison === undefined) {
        return unknownValue;
      }
      if (name === 'gt') return comparison > 0;
      if (name === 'ge') return comparison >= 0;
      if (name === 'lt') return comparison < 0;
      return comparison <= 0;
    }
    case 'and': return values.length > 0 ? values.every((value) => asBoolean(value)) : unknownValue;
    case 'or': return values.length > 0 ? values.some((value) => asBoolean(value)) : unknownValue;
    case 'not': return values.length === 1 ? !asBoolean(values[0]) : unknownValue;
    case 'xor': return values.length > 0
      ? values.reduce((result, value) => result !== Boolean(value), false)
      : unknownValue;
    case 'in':
    case 'notin': {
      if (values.length < 2) return unknownValue;
      const found = values.slice(1).some((value) => equal(first, value));
      return name === 'in' ? found : !found;
    }
    case 'startswith': return values.length === 2
      ? stringValue(first).toLowerCase().startsWith(stringValue(values[1]).toLowerCase())
      : unknownValue;
    case 'endswith': return values.length === 2
      ? stringValue(first).toLowerCase().endsWith(stringValue(values[1]).toLowerCase())
      : unknownValue;
    case 'contains': return values.length === 2
      ? stringValue(first).toLowerCase().includes(stringValue(values[1]).toLowerCase())
      : unknownValue;
    case 'containsvalue': {
      if (values.length !== 2 || !values[1] || typeof values[1] !== 'object') {
        return false;
      }
      return Object.values(values[1]).some((value) => equal(value, first));
    }
    case 'coalesce': return values.find((value) => value !== null && value !== '');
    case 'iif': return values.length === 3 ? (asBoolean(first) ? values[1] : values[2]) : unknownValue;
    case 'succeeded':
    case 'succeededorfailed':
    case 'always': return true;
    case 'failed':
    case 'canceled': return false;
    case 'lower':
    case 'tolower': return values.length === 1 ? stringValue(first).toLowerCase() : unknownValue;
    case 'upper':
    case 'toupper': return values.length === 1 ? stringValue(first).toUpperCase() : unknownValue;
    case 'trim': return values.length === 1 ? stringValue(first).trim() : unknownValue;
    case 'length': return values.length === 1 &&
      (typeof first === 'string' || Array.isArray(first))
      ? first.length
      : unknownValue;
    case 'join': return values.length === 2 && Array.isArray(values[1])
      ? values[1].join(stringValue(first))
      : unknownValue;
    case 'replace': return values.length === 3
      ? stringValue(first).split(stringValue(values[1])).join(stringValue(values[2]))
      : unknownValue;
    case 'split': return values.length === 2
      ? stringValue(first).split(stringValue(values[1]))
      : unknownValue;
    case 'format': {
      if (values.length < 1) return unknownValue;
      return stringValue(first).replace(/\{(\d+)\}/g, (match, index: string) =>
        Number(index) + 1 < values.length ? stringValue(values[Number(index) + 1]) : match
      );
    }
    default: return unknownValue;
  }
}

interface FlowNode {
  id: string;
  label: string;
  shape: 'start' | 'action' | 'decision' | 'finish';
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  scenarioChoice: boolean;
  highlighted: boolean;
}

class MermaidFlowBuilder {
  private readonly nodes: FlowNode[] = [];
  private readonly edges: FlowEdge[] = [];
  private readonly unresolvedConditions = new Set<string>();
  private nextId = 0;

  constructor(private readonly inputs: Record<string, unknown>) {}

  build(documents: unknown[]): DecisionPathResult {
    const start = this.addNode('Start', 'start');
    const finish = this.addNode('Pipeline complete', 'finish');
    let continuation = finish;
    for (let index = documents.length - 1; index >= 0; index--) {
      continuation = this.pipelineSequence(documents[index], continuation);
    }
    this.addEdge(start, continuation, undefined);
    this.highlightScenarioPath(start);

    const lines = ['flowchart TD'];
    for (const node of this.nodes) {
      const shape = node.shape === 'start'
        ? `(["${this.escapeLabel(node.label)}"])`
        : node.shape === 'finish'
          ? `(["${this.escapeLabel(node.label)}"])`
          : node.shape === 'decision'
            ? `{"${this.escapeLabel(node.label)}"}`
            : `["${this.escapeLabel(node.label)}"]`;
      lines.push(`  ${node.id}${shape}`);
    }
    for (const edge of this.edges) {
      const label = edge.label ? `|${this.escapeLabel(edge.label)}|` : '';
      lines.push(`  ${edge.from} -->${label} ${edge.to}`);
    }
    const selectedEdges = this.edges
      .map((edge, index) => edge.highlighted ? index : -1)
      .filter((index) => index >= 0);
    if (selectedEdges.length > 0) {
      lines.push(
        `  linkStyle ${selectedEdges.join(',')} stroke:#2e8b57,stroke-width:3px`
      );
    }
    return {
      mermaid: lines.join('\n'),
      unresolvedConditions: [...this.unresolvedConditions],
    };
  }

  private pipelineSequence(root: unknown, continuation: string): string {
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      return continuation;
    }
    const object = root as Record<string, unknown>;
    const sequence = Array.isArray(object.stages)
      ? object.stages
      : Array.isArray(object.jobs)
        ? object.jobs
        : Array.isArray(object.steps)
          ? object.steps
          : [];
    const kind = Array.isArray(object.stages)
      ? 'Stage'
      : Array.isArray(object.jobs)
        ? 'Job'
        : Array.isArray(object.steps)
          ? 'Step'
          : undefined;
    return kind ? this.sequence(sequence, kind, continuation) : continuation;
  }

  private sequence(items: unknown[], kind: string, continuation: string): string {
    let next = continuation;
    for (let index = items.length - 1; index >= 0; index--) {
      if (items[index] && typeof items[index] === 'object' && !Array.isArray(items[index])) {
        const current = Object.entries(items[index] as Record<string, unknown>)
          .map(([key, value]) => ({ conditional: conditionalKey(key), value }))
          .find((entry) => entry.conditional !== undefined);
        if (current?.conditional) {
          let start = index;
          while (start > 0) {
            const previous = items[start - 1];
            if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
              break;
            }
            const hasConditional = Object.keys(previous as Record<string, unknown>)
              .some((key) => conditionalKey(key) !== undefined);
            if (!hasConditional) {
              break;
            }
            start--;
          }

          let branch = next;
          for (let branchIndex = index; branchIndex >= start; branchIndex--) {
            const branchObject = items[branchIndex] as Record<string, unknown>;
            const entry = Object.entries(branchObject)
              .map(([key, value]) => ({ conditional: conditionalKey(key), value }))
              .find((item) => item.conditional !== undefined);
            if (!entry?.conditional) {
              continue;
            }
            const branchItems = Array.isArray(entry.value) ? entry.value : [entry.value];
            const included = this.sequence(branchItems, kind, next);
            if (entry.conditional.kind === 'else') {
              branch = included;
            } else {
              branch = this.gate(
                `Include ${kind.toLowerCase()} block?`,
                entry.conditional.expression,
                included,
                branch
              );
            }
          }
          next = branch;
          index = start;
          continue;
        }
      }
      next = this.item(items[index], kind, index, next);
    }
    return next;
  }

  private item(value: unknown, kind: string, index: number, continuation: string): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return this.action(kind, `${kind} ${index + 1}`, undefined, continuation);
    }
    const object = value as Record<string, unknown>;
    const conditionalEntry = Object.entries(object)
      .map(([key, value]) => ({ key, value, conditional: conditionalKey(key) }))
      .find((entry) => entry.conditional !== undefined);
    if (conditionalEntry) {
      const branchValues = Array.isArray(conditionalEntry.value)
        ? conditionalEntry.value
        : [conditionalEntry.value];
      const included = this.sequence(branchValues, kind, continuation);
      return conditionalEntry.conditional?.kind === 'else'
        ? included
        : this.gate(
          `Include ${kind.toLowerCase()} block?`,
          conditionalEntry.conditional?.expression ?? '',
          included,
          continuation
        );
    }

    const label = this.itemLabel(object, kind, index);
    const condition = typeof object.condition === 'string' ? object.condition : undefined;
    const childSequence = kind === 'Stage' && Array.isArray(object.jobs)
      ? this.sequence(object.jobs, 'Job', continuation)
      : kind === 'Job' && Array.isArray(object.steps)
        ? this.sequence(object.steps, 'Step', continuation)
        : continuation;
    return this.action(kind, label, condition, childSequence, continuation);
  }

  private action(
    kind: string,
    label: string,
    condition: string | undefined,
    bodyContinuation: string,
    skipContinuation = bodyContinuation
  ): string {
    const actionId = this.addNode(`${kind}: ${label}`, 'action');
    this.addEdge(actionId, bodyContinuation, undefined, true);
    return condition
      ? this.gate(
        `Run ${kind.toLowerCase()} "${label}"?`,
        condition,
        actionId,
        skipContinuation
      )
      : actionId;
  }

  private gate(
    label: string,
    source: string,
    includePath: string,
    skipPath: string
  ): string {
    let result: boolean | typeof unknownValue = unknownValue;
    try {
      result = asBoolean(evaluate(parseExpression(source), this.inputs));
    } catch {
      this.unresolvedConditions.add(source);
    }
    const decisionId = this.addNode(`${label}\n${source}`, 'decision');
    this.addEdge(decisionId, includePath, 'Yes', result === true);
    this.addEdge(decisionId, skipPath, 'No', result === false);
    if (result === unknownValue) {
      this.unresolvedConditions.add(source);
    }
    return decisionId;
  }

  private itemLabel(object: Record<string, unknown>, kind: string, index: number): string {
    const labelKeys = kind === 'Stage'
      ? ['stage', 'displayName']
      : kind === 'Job'
        ? ['job', 'deployment', 'displayName']
        : ['name', 'displayName', 'task', 'script', 'bash', 'pwsh', 'powershell'];
    for (const key of labelKeys) {
      const value = object[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return `${value}`;
      }
    }
    if (typeof object.template === 'string') {
      return object.template;
    }
    return `${kind} ${index + 1}`;
  }

  private addNode(label: string, shape: FlowNode['shape']): string {
    const id = `n${this.nextId++}`;
    this.nodes.push({ id, label, shape });
    return id;
  }

  private addEdge(
    from: string,
    to: string,
    label: string | undefined,
    scenarioChoice = false
  ): void {
    this.edges.push({ from, to, label, scenarioChoice, highlighted: false });
  }

  private highlightScenarioPath(start: string): void {
    let current = start;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const node = this.nodes.find((item) => item.id === current);
      if (!node || node.shape === 'finish') {
        return;
      }
      const outgoing = this.edges
        .map((edge, index) => ({ edge, index }))
        .filter(({ edge }) => edge.from === current);
      const next = node.shape === 'decision'
        ? outgoing.find(({ edge }) => edge.scenarioChoice)
        : outgoing[0];
      if (!next) {
        return;
      }
      next.edge.highlighted = true;
      current = next.edge.to;
    }
  }

  private escapeLabel(label: string): string {
    return label.replace(/&/g, '#amp;').replace(/"/g, '#quot;').replace(/\n/g, '<br/>');
  }
}

export function generateDecisionPaths(
  content: string,
  inputs: Record<string, unknown>
): DecisionPathResult {
  const documents = yaml.parseAllDocuments(content, { prettyErrors: true });
  const parseErrors = documents.flatMap((document) => document.errors);
  if (parseErrors.length > 0) {
    throw new Error(`Could not parse YAML: ${parseErrors.map((error) => error.message).join('; ')}`);
  }
  return new MermaidFlowBuilder(inputs).build(
    documents.map((document) => document.toJS())
  );
}
