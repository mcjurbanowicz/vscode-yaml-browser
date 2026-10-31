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
  icon?: string;
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

const entryIcons = {
  stage: { concrete: 'symbol-class', template: 'symbol-interface' },
  job: { concrete: 'symbol-method', template: 'symbol-function' },
  step: { concrete: 'symbol-event', template: 'symbol-operator' },
};

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

function findTemplateReference(node: unknown): { node: unknown; pair: Pair } | undefined {
  const templatePair = mapPair(node, 'template');
  if (templatePair) {
    return { node, pair: templatePair };
  }

  if (node instanceof YAMLSeq) {
    for (const item of node.items) {
      const reference = findTemplateReference(item);
      if (reference) {
        return reference;
      }
    }
    return undefined;
  }

  for (const pair of mapEntries(node)) {
    const key = displayValue(pair.key);
    if (key?.startsWith('${{')) {
      const reference = findTemplateReference(pair.value);
      if (reference) {
        return reference;
      }
    }
  }
  return undefined;
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
  kind: 'stage' | 'job' | 'step',
  options: YamlStructureOptions,
  idPrefix = ''
): YamlStructureNode {
  const id = idPrefix ? `${idPrefix}-${kind}-${index}` : `${kind}-${index}`;
  const templateReference = findTemplateReference(node);
  const entryNode = templateReference?.node ?? node;
  const templatePath = templateReference
    ? displayValue(templateReference.pair.value)
    : undefined;
  const templateName = templatePath?.split(/[\\/]/).pop();
  const explicitName = displayValue(mapValue(entryNode, 'name'));
  const displayName = displayValue(mapValue(entryNode, 'displayName'));
  const stageOrJobName = kind === 'stage'
    ? displayValue(mapValue(entryNode, 'stage'))
    : kind === 'job'
      ? displayValue(mapValue(entryNode, 'job')) ?? displayValue(mapValue(entryNode, 'deployment'))
      : undefined;
  const taskType = kind === 'step' ? displayValue(mapValue(entryNode, 'task')) : undefined;
  const stepType = kind === 'step'
    ? ['script', 'bash', 'pwsh', 'powershell', 'checkout', 'publish', 'download', 'template']
      .find((key) => mapPair(entryNode, key) !== undefined)
    : undefined;
  const namedLabel = kind === 'step' && explicitName && displayName
    ? `${explicitName} / ${displayName}`
    : explicitName ?? displayName;
  const label = templateName
    ?? namedLabel
    ?? stageOrJobName
    ?? (taskType ? `# ${taskType}` : stepType)
    ?? `${kind} ${index + 1}`;
  const children: YamlStructureNode[] = [];

  if (options.showConditions) {
    const conditionPair = mapPair(entryNode, 'condition');
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
    const parametersPair = mapPair(entryNode, 'parameters');
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
    const childrenPair = mapPair(entryNode, jobsOrSteps);
    if (childrenPair) {
      const entries = kind === 'stage'
        ? buildEntries(childrenPair.value, 'job', options, id)
        : buildEntries(childrenPair.value, 'step', options, `${id}-${jobsOrSteps}`);
      children.push(...entries);
    }
  }

  const entry = sectionNode(
    id,
    label,
    entryNode,
    templateReference ? pairOffset(templateReference.pair) : offsetOf(node),
    children
  );
  entry.icon = entryIcons[kind][templateName ? 'template' : 'concrete'];
  return entry;
}

function addDuplicateIndexes(nodes: YamlStructureNode[]): YamlStructureNode[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.label, (counts.get(node.label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    if ((counts.get(node.label) ?? 0) < 2) {
      return node;
    }
    const index = (seen.get(node.label) ?? 0) + 1;
    seen.set(node.label, index);
    return { ...node, label: `${node.label} #${index}` };
  });
}

function buildEntries(
  node: unknown,
  kind: 'parameter' | 'variable' | 'schedule' | 'stage' | 'job' | 'step',
  options: YamlStructureOptions,
  idPrefix = ''
): YamlStructureNode[] {
  if (node instanceof YAMLSeq) {
    const entries = node.items.map((item, index) => {
      if (kind === 'stage' || kind === 'job' || kind === 'step') {
        return namedEntry(item, index, kind, options, idPrefix);
      }

      const name = displayValue(mapValue(item, 'name'))
        ?? displayValue(mapValue(item, 'displayName'))
        ?? displayValue(mapValue(item, 'cron'))
        ?? `${kind} ${index + 1}`;
      return sectionNode(
        idPrefix ? `${idPrefix}-${kind}-${index}` : `${kind}-${index}`,
        name,
        item,
        offsetOf(item),
        []
      );
    });
    return kind === 'stage' || kind === 'job' || kind === 'step'
      ? addDuplicateIndexes(entries)
      : entries;
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
  return validDocuments.flatMap(({ index, contents }) => {
    const sections = buildDocumentSections(contents, options);
    return validDocuments.length === 1
      ? sections
      : sections.map((node) => prefixNodeIds(node, `document-${index}`));
  });
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
