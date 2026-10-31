import { parseAllDocuments, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml';

export interface YamlStructureOptions {
  showConditions: boolean;
  showStageParameters: boolean;
  showJobParameters: boolean;
  showStepParameters: boolean;
}

export interface YamlStructureNode {
  id: string;
  label: string;
  offset: number;
  children: YamlStructureNode[];
}

const sectionNames = [
  'parameters',
  'variables',
  'schedules',
  'trigger',
  'stages',
  'jobs',
  'steps',
];

function scalarValue(node: unknown): unknown {
  return node instanceof Scalar ? node.value : undefined;
}

function displayValue(node: unknown): string | undefined {
  const value = scalarValue(node);
  return value === undefined || value === null ? undefined : String(value);
}

function mapEntries(node: unknown): Pair[] {
  return node instanceof YAMLMap ? node.items : [];
}

function mapValue(node: unknown, key: string): unknown {
  return mapEntries(node).find((pair) => scalarValue(pair.key) === key)?.value;
}

function mapPair(node: unknown, key: string): Pair | undefined {
  return mapEntries(node).find((pair) => scalarValue(pair.key) === key);
}

function offsetOf(node: unknown): number {
  if (node instanceof Scalar || node instanceof YAMLMap || node instanceof YAMLSeq) {
    return node.range?.[0] ?? 0;
  }
  return 0;
}

function pairOffset(pair: Pair | undefined): number {
  return pair ? offsetOf(pair.key) : 0;
}

function sectionNode(
  id: string,
  label: string,
  node: unknown,
  offset: number,
  children: YamlStructureNode[] = []
): YamlStructureNode {
  return {
    id,
    label,
    offset,
    children,
  };
}

function namedEntry(
  node: unknown,
  index: number,
  kind: string,
  options: YamlStructureOptions,
  idPrefix = ''
): YamlStructureNode {
  const id = idPrefix ? `${idPrefix}-${kind}-${index}` : `${kind}-${index}`;
  const nameKeys = kind === 'stage'
    ? ['stage', 'name']
    : kind === 'job'
      ? ['job', 'deployment', 'name']
      : [];
  const namePair = nameKeys.length
    ? nameKeys.map((key) => mapPair(node, key)).find((pair) => pair !== undefined)
    : mapEntries(node).find((pair) => ![
      'displayName',
      'condition',
      'parameters',
      'inputs',
      'env',
      'continueOnError',
      'enabled',
      'timeoutInMinutes',
      'retryCountOnTaskFailure',
      'target',
    ].includes(String(scalarValue(pair.key))));
  const name = displayValue(namePair?.value) ?? `${kind} ${index + 1}`;
  const displayName = displayValue(mapValue(node, 'displayName'));
  const label = displayName ? `${name} / ${displayName}` : name;
  const children: YamlStructureNode[] = [];

  if (options.showConditions) {
    const conditionPair = mapPair(node, 'condition');
    const condition = displayValue(conditionPair?.value);
    if (condition && conditionPair) {
      children.push(sectionNode(
        `${id}-condition`,
        `condition: ${condition}`,
        conditionPair.value,
        pairOffset(conditionPair)
      ));
    }
  }

  const showParameters = kind === 'stage'
    ? options.showStageParameters
    : kind === 'job'
      ? options.showJobParameters
      : options.showStepParameters;
  if (showParameters) {
    const parametersPair = mapPair(node, 'parameters');
    if (parametersPair) {
      children.push(sectionNode(
        `${id}-parameters`,
        'parameters >',
        parametersPair.value,
        pairOffset(parametersPair),
        valueEntries(parametersPair.value, `${id}-parameters`)
      ));
    }
  }

  if (kind === 'stage' || kind === 'job') {
    const jobsOrSteps = kind === 'stage' ? 'jobs' : 'steps';
    const childrenPair = mapPair(node, jobsOrSteps);
    if (childrenPair) {
      const entries = kind === 'stage'
        ? buildEntries(childrenPair.value, 'job', options, `${id}-${jobsOrSteps}`)
        : buildEntries(childrenPair.value, 'step', options, `${id}-${jobsOrSteps}`);
      children.push(sectionNode(
        `${id}-${jobsOrSteps}`,
        `${jobsOrSteps} >`,
        childrenPair.value,
        pairOffset(childrenPair),
        entries
      ));
    }
  }

  return sectionNode(
    id,
    label,
    node,
    offsetOf(node),
    children
  );
}

function buildEntries(
  node: unknown,
  kind: 'parameter' | 'variable' | 'schedule' | 'stage' | 'job' | 'step',
  options: YamlStructureOptions,
  idPrefix = ''
): YamlStructureNode[] {
  if (node instanceof YAMLSeq) {
    return node.items.map((item, index) => {
      if (kind === 'stage' || kind === 'job' || kind === 'step') {
        return namedEntry(item, index, kind, options, idPrefix);
      }

      const name = displayValue(mapValue(item, 'name'))
        ?? displayValue(mapValue(item, 'cron'))
        ?? `${kind} ${index + 1}`;
      const displayName = displayValue(mapValue(item, 'displayName'));
      return sectionNode(
        idPrefix ? `${idPrefix}-${kind}-${index}` : `${kind}-${index}`,
        displayName ? `${name} / ${displayName}` : name,
        item,
        offsetOf(item),
        []
      );
    });
  }

  if (node instanceof YAMLMap) {
    return node.items.map((pair, index) => {
      const name = displayValue(pair.key) ?? `${kind} ${index + 1}`;
      return sectionNode(
        idPrefix ? `${idPrefix}-${kind}-${index}` : `${kind}-${index}`,
        name,
        pair.value,
        pairOffset(pair)
      );
    });
  }

  return [];
}

function valueEntries(node: unknown, prefix: string): YamlStructureNode[] {
  if (node instanceof YAMLMap) {
    return node.items.map((pair, index) => {
      const key = displayValue(pair.key) ?? `item ${index + 1}`;
      const value = displayValue(pair.value);
      return sectionNode(
        `${prefix}-${index}`,
        value === undefined ? key : `${key}: ${value}`,
        pair.value,
        pairOffset(pair)
      );
    });
  }

  if (node instanceof YAMLSeq) {
    return node.items.map((item, index) =>
      sectionNode(
        `${prefix}-${index}`,
        displayValue(item) ?? `item ${index + 1}`,
        item,
        offsetOf(item)
      )
    );
  }

  return [];
}

export function buildYamlStructure(
  content: string,
  options: YamlStructureOptions
): YamlStructureNode[] {
  const documents = parseAllDocuments(content);
  const validDocuments: Array<{ index: number; contents: YAMLMap }> = [];
  documents.forEach((document, index) => {
    if (document.errors.length === 0 && document.contents instanceof YAMLMap) {
      validDocuments.push({ index, contents: document.contents });
    }
  });
  if (validDocuments.length === 0) {
    return [];
  }
  if (validDocuments.length === 1) {
    return buildDocumentSections(validDocuments[0].contents, options);
  }

  return validDocuments.map(({ index, contents }) => ({
    id: `document-${index}`,
    label: `Document ${index + 1} >`,
    offset: offsetOf(contents),
    children: buildDocumentSections(contents, options)
      .map((node) => prefixNodeIds(node, `document-${index}`)),
  }));
}

function buildDocumentSections(
  root: YAMLMap,
  options: YamlStructureOptions
): YamlStructureNode[] {
  const nodes: YamlStructureNode[] = [];
  for (const sectionName of sectionNames) {
    const pair = mapPair(root, sectionName);
    if (!pair) {
      continue;
    }

    const entries = sectionName === 'stages'
      ? buildEntries(pair.value, 'stage', options)
      : sectionName === 'jobs'
        ? buildEntries(pair.value, 'job', options)
        : sectionName === 'steps'
          ? buildEntries(pair.value, 'step', options)
          : sectionName === 'parameters'
            ? buildEntries(pair.value, 'parameter', options)
            : sectionName === 'variables'
              ? buildEntries(pair.value, 'variable', options)
              : sectionName === 'schedules'
                ? buildEntries(pair.value, 'schedule', options)
                : valueEntries(pair.value, sectionName);

    nodes.push(sectionNode(
      sectionName,
      `${sectionName} >`,
      pair.value,
      pairOffset(pair),
      entries
    ));
  }
  return nodes;
}

function prefixNodeIds(node: YamlStructureNode, prefix: string): YamlStructureNode {
  return {
    ...node,
    id: `${prefix}-${node.id}`,
    children: node.children.map((child) => prefixNodeIds(child, prefix)),
  };
}
