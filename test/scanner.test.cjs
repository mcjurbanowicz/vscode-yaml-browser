const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CachingRegistry } = require('../out/caching/CachingRegistry');
const { TemplateScanner } = require('../out/scanner/TemplateScanner');
const { YamlValidator } = require('../out/validation/YamlValidator');
const { TemplateExpander } = require('../out/templates/TemplateExpander');
const { buildYamlStructure } = require('../out/tree/YamlStructure');
const { referenceDisplayPath } = require('../out/tree/referencePath');
const yaml = require('yaml');

const pipelineRoot = path.resolve(__dirname, '..', 'test-data', 'pipelines');
const config = {
  maxDepth: 3,
  minDepth: 0,
  includePatterns: ['*.yml', '*.yaml'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
};

test('expands nested stage, job, and step templates with parameters', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-expand-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));

  const templatesDirectory = path.join(fixtureRoot, 'templates');
  await fs.mkdir(path.join(templatesDirectory, 'jobs'), { recursive: true });
  await fs.mkdir(path.join(templatesDirectory, 'steps'), { recursive: true });
  const pipeline = [
    'parameters:',
    '  - name: stageName',
    '    default: Build',
    'stages:',
    '  - template: templates/stages.yml',
    '    parameters:',
    '      stageName: ${{ parameters.stageName }}',
  ].join('\n');
  await fs.writeFile(
    path.join(templatesDirectory, 'stages.yml'),
    [
      'parameters:',
      '  - name: stageName',
      '    default: DefaultStage',
      'stages:',
      '  - stage: ${{ parameters.stageName }}',
      '    jobs:',
      '      - template: jobs/build.yml',
      '        parameters:',
      '          scriptText: echo from job',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(templatesDirectory, 'jobs', 'build.yml'),
    [
      'parameters:',
      '  - name: scriptText',
      '    default: echo default',
      'jobs:',
      '  - job: BuildJob',
      '    steps:',
      '      - template: ../steps/commands.yml',
      '        parameters:',
      '          commands:',
      '            - script: ${{ parameters.scriptText }}',
      '            - script: echo from parameter list',
    ].join('\n')
  );
  await fs.writeFile(
    path.join(templatesDirectory, 'steps', 'commands.yml'),
    [
      'parameters:',
      '  - name: commands',
      '    type: stepList',
      '    default: []',
      'steps:',
      '  - ${{ parameters.commands }}',
      '  - script: echo from steps template',
    ].join('\n')
  );

  const result = await new TemplateExpander().expand(
    path.join(fixtureRoot, 'pipeline.yml'),
    pipeline
  );
  const expanded = yaml.parse(result);

  assert.equal(expanded.stages[0].stage, 'Build');
  assert.equal(expanded.stages[0].jobs[0].job, 'BuildJob');
  assert.deepEqual(
    expanded.stages[0].jobs[0].steps.map((step) => step.script),
    ['echo from job', 'echo from parameter list', 'echo from steps template']
  );
  assert.equal(result.includes('template:'), false);
});

test('reports circular local template references while expanding', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-expand-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));

  const pipelinePath = path.join(fixtureRoot, 'pipeline.yml');
  const pipeline = 'steps:\n  - template: nested.yml\n';
  await fs.writeFile(pipelinePath, pipeline);
  await fs.writeFile(
    path.join(fixtureRoot, 'nested.yml'),
    'steps:\n  - template: pipeline.yml\n'
  );

  await assert.rejects(
    new TemplateExpander().expand(pipelinePath, pipeline),
    /Circular template reference/
  );
});

test('displays reference paths from their highest shared directory', () => {
  const root = path.join(os.tmpdir(), 'ado-yaml-reference-paths');
  const activePath = path.join(
    root,
    'pipelines',
    'common-pipeline-templates',
    'templatesLevelDown',
    'helloDown.yaml'
  );
  const targetPath = path.join(root, 'pipelines', 'otherTemplates', 'hello.yaml');

  assert.equal(
    referenceDisplayPath(activePath, targetPath),
    '../pipelines/otherTemplates/hello.yaml'
  );
});

test('scans nested template references and respects maxDepth', async (t) => {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const cache = new CachingRegistry(cacheDirectory, 100, true);
  const scanner = new TemplateScanner(cache, pipelineRoot);
  const result = await scanner.scan('deploy.yml', config);

  assert.equal(result.errors.length, 0);
  assert.equal(result.tree.tree.children.length, 1);
  assert.match(result.tree.tree.children[0].path, /deploy-template\.yml$/);
  assert.ok(result.tree.references.length >= 3);

  cache.clear();
  const shallowResult = await scanner.scan('deploy.yml', { ...config, maxDepth: 1 });
  assert.equal(shallowResult.tree.tree.children.length, 1);
  assert.equal(shallowResult.tree.tree.children[0].children.length, 0);
});

test('invalidates cached trees when a nested template changes', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-fixture-'));
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const templatesDirectory = path.join(fixtureRoot, 'templates');
  await fs.mkdir(templatesDirectory);
  await fs.writeFile(
    path.join(fixtureRoot, 'main.yml'),
    'steps:\n  - template: templates/first.yml\n'
  );
  const firstTemplatePath = path.join(templatesDirectory, 'first.yml');
  await fs.writeFile(firstTemplatePath, 'steps:\n  - template: second.yml\n');
  await fs.writeFile(path.join(templatesDirectory, 'second.yml'), 'steps: []\n');
  await fs.writeFile(path.join(templatesDirectory, 'third.yml'), 'steps: []\n');

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    fixtureRoot
  );
  const before = await scanner.scan('main.yml', { ...config, maxDepth: 2 });
  const cached = await scanner.scan('main.yml', { ...config, maxDepth: 2 });
  assert.strictEqual(cached.tree, before.tree);

  await fs.writeFile(firstTemplatePath, 'steps:\n  - template: third.yml\n');
  const future = new Date(Date.now() + 2000);
  await fs.utimes(firstTemplatePath, future, future);

  const after = await scanner.scan('main.yml', { ...config, maxDepth: 2 });
  assert.equal(
    after.tree.tree.children[0].children[0].path,
    path.join(templatesDirectory, 'third.yml')
  );
});

test('finds file references in generic YAML without interpreting comments or expressions', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-refs-'));
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const templatesDirectory = path.join(fixtureRoot, 'templates');
  await fs.mkdir(templatesDirectory);
  await fs.writeFile(
    path.join(fixtureRoot, 'main.yml'),
    '# template: missing.yml\nmetadata:\n  owner: team\nincludes:\n  - template: templates/child.yaml\n  - template: "${{ parameters.templatePath }}"\n'
  );
  await fs.writeFile(
    path.join(templatesDirectory, 'child.yaml'),
    'name: generic template\ncontent:\n  enabled: true\n'
  );

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    fixtureRoot
  );
  const result = await scanner.scan('main.yml', { ...config, maxDepth: 1 });

  assert.equal(result.errors.length, 0);
  assert.equal(result.tree.references.length, 1);
  assert.equal(result.tree.references[0].path, path.join(templatesDirectory, 'child.yaml'));
});

test('does not descend past maxDepth while still finding local references', async (t) => {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    pipelineRoot
  );
  const result = await scanner.scan('deploy.yml', { ...config, maxDepth: 3 });

  assert.equal(result.tree.tree.children[0].children[0].children[0].children.length, 0);
});

test('directory scan descends into nested pipeline folders', async (t) => {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    pipelineRoot
  );
  const results = await scanner.scanDirectory(pipelineRoot, config);
  const scannedFiles = results.map((result) => path.basename(result.tree.root));

  assert.ok(scannedFiles.includes('build.yml'));
  assert.ok(scannedFiles.includes('deploy.yml'));
  assert.ok(scannedFiles.includes('hello.yaml'));
});

test('validates multi-document pipeline YAML without false parse errors', async () => {
  const content = await fs.readFile(path.join(pipelineRoot, 'deploy.yml'), 'utf8');
  const diagnostics = new YamlValidator().validate(content, 'deploy.yml');

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'PARSE_ERROR'), false);
});

test('accepts valid YAML without applying pipeline-specific schema rules', () => {
  const content = 'metadata:\n  owner: team\nvariables:\n  - name: 1\n    value: enabled\n';
  const diagnostics = new YamlValidator().validate(content, 'generic.yaml');

  assert.deepEqual(diagnostics, []);
});

test('builds a clickable YAML overview with optional conditions and parameters', () => {
  const content = [
    'parameters:',
    '  - name: region',
    "    displayName: 'Target region'",
    'variables:',
    '  buildMode: release',
    'schedules:',
    "  - cron: '0 0 * * *'",
    'trigger:',
    '  - main',
    'stages:',
    '  - stage: Build',
    "    displayName: 'Build stage'",
    '    condition: succeeded()',
    '    parameters:',
    '      pool: linux',
    '    jobs:',
    '      - job: Compile',
    "        displayName: 'Compile job'",
    '        condition: succeeded()',
    '        parameters:',
    '          retries: 2',
    '        steps:',
    '          - task: DownloadPipelineArtifact@2',
    "            displayName: 'Run tests'",
    '            condition: succeeded()',
    '            parameters:',
    '              timeout: 10',
  ].join('\n');

  const nodes = buildYamlStructure(content, {
    showConditions: true,
    showStageParameters: true,
    showJobParameters: true,
    showStepParameters: true,
  });
  const findNode = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item;
      const found = findNode(item.children, id);
      if (found) return found;
    }
    return undefined;
  };

  assert.deepEqual(nodes.map((node) => node.label), [
    'PARAMETERS >',
    'VARIABLES >',
    'SCHEDULES >',
    'TRIGGER >',
    'STAGES >',
  ]);
  assert.equal(findNode(nodes, 'parameter-0').label, 'region');
  assert.equal(findNode(nodes, 'parameter-0').iconColor, 'foreground');
  assert.equal(findNode(nodes, 'stage-0').label, 'Build stage');
  assert.ok(findNode(nodes, 'stage-0-condition'));
  assert.ok(findNode(nodes, 'stage-0-parameters'));
  assert.equal(findNode(nodes, 'stage-0-parameters').iconColor, 'foreground');
  assert.equal(findNode(nodes, 'stage-0-job-0').label, 'Compile job');
  assert.ok(findNode(nodes, 'stage-0-job-0-condition'));
  assert.ok(findNode(nodes, 'stage-0-job-0-parameters'));
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-0').label, 'Run tests');
  assert.ok(findNode(nodes, 'stage-0-job-0').children.some((node) => node.label === 'Run tests'));
  assert.ok(findNode(nodes, 'stage-0-job-0-steps-step-0-condition'));
  assert.ok(findNode(nodes, 'stage-0-job-0-steps-step-0-parameters'));
  assert.ok(nodes.every((node) => node.label !== 'JOBS >'));
  assert.ok(
    findNode(nodes, 'stage-0-job-0').children.every((node) => node.label !== 'STEPS >')
  );
  assert.equal(content.slice(findNode(nodes, 'stage-0').offset).startsWith('stage: Build'), true);

  const hiddenDetails = buildYamlStructure(content, {
    showConditions: false,
    showStageParameters: false,
    showJobParameters: false,
    showStepParameters: false,
  });
  assert.equal(findNode(hiddenDetails, 'stage-0-condition'), undefined);
  assert.equal(findNode(hiddenDetails, 'stage-0-parameters'), undefined);
  assert.equal(findNode(hiddenDetails, 'stage-0-job-0-condition'), undefined);
  assert.equal(findNode(hiddenDetails, 'stage-0-job-0-steps-step-0-parameters'), undefined);
});

test('prefers explicit names and numbers duplicate step labels and task types', () => {
  const content = [
    'stages:',
    '  - stage: InternalStage',
    '    displayName: Stage display',
    '    jobs:',
    '      - job: InternalJob',
    '        displayName: Job display',
    '        steps:',
    '          - name: FirstNamedStep',
    '            displayName: Step display',
    '            pwsh: Write-Output first',
    '          - name: FirstNamedStep',
    '            displayName: Step display',
    '            pwsh: Write-Output second',
    '          - task: DownloadPipelineArtifact@2',
    '          - task: DownloadPipelineArtifact@2',
    '          - pwsh: Write-Output third',
    '          - pwsh: Write-Output fourth',
  ].join('\n');
  const nodes = buildYamlStructure(content, {
    showConditions: false,
    showStageParameters: false,
    showJobParameters: false,
    showStepParameters: false,
  });
  const findNode = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item;
      const found = findNode(item.children, id);
      if (found) return found;
    }
    return undefined;
  };

  assert.equal(findNode(nodes, 'stage-0').label, 'Stage display');
  assert.equal(findNode(nodes, 'stage-0').icon, 'symbol-class');
  assert.equal(findNode(nodes, 'stage-0').iconColor, 'adoInspector.stageIconForeground');
  assert.equal(findNode(nodes, 'stage-0-job-0').label, 'Job display');
  assert.equal(findNode(nodes, 'stage-0-job-0').icon, 'symbol-method');
  assert.equal(findNode(nodes, 'stage-0-job-0').iconColor, 'adoInspector.jobIconForeground');
  assert.equal(
    findNode(nodes, 'stage-0-job-0-steps-step-0').label,
    'FirstNamedStep / Step display #1'
  );
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-0').icon, 'symbol-event');
  assert.equal(
    findNode(nodes, 'stage-0-job-0-steps-step-0').iconColor,
    'adoInspector.stepIconForeground'
  );
  assert.equal(
    findNode(nodes, 'stage-0-job-0-steps-step-1').label,
    'FirstNamedStep / Step display #2'
  );
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-2').label, '# DownloadPipelineArtifact@2 #1');
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-3').label, '# DownloadPipelineArtifact@2 #2');
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-4').label, 'pwsh #1');
  assert.equal(findNode(nodes, 'stage-0-job-0-steps-step-5').label, 'pwsh #2');
});

test('includes structure from every YAML document without displaying document separators', () => {
  const content = 'parameters:\n  - name: first\n---\nstages:\n  - stage: Second\n';
  const nodes = buildYamlStructure(content, {
    showConditions: false,
    showStageParameters: false,
    showJobParameters: false,
    showStepParameters: false,
  });

  assert.deepEqual(nodes.map((node) => node.label), ['PARAMETERS >', 'STAGES >']);
  assert.equal(nodes[0].children[0].label, 'first');
  assert.equal(nodes[1].children[0].label, 'Second');
  assert.notEqual(nodes[0].id, nodes[1].id);
});

test('labels stage, job, and step template references by filename with a distinct icon', () => {
  const content = [
    'stages:',
    '  - template: stages/deploy-stage.yml',
    "  - ${{ if eq(parameters.environment, 'production') }}:",
    '      - template: stages/conditional-stage.yml',
    'jobs:',
    '  - template: jobs/deploy-job.yml',
    'steps:',
    '  - template: steps/deploy-steps.yml',
  ].join('\n');
  const nodes = buildYamlStructure(content, {
    showConditions: false,
    showStageParameters: false,
    showJobParameters: false,
    showStepParameters: false,
  });
  const templateNodes = nodes.flatMap((section) => section.children);

  assert.deepEqual(templateNodes.map(({ label }) => label), [
    'deploy-stage.yml',
    'conditional-stage.yml',
    'deploy-job.yml',
    'deploy-steps.yml',
  ]);
  assert.deepEqual(templateNodes.map(({ icon }) => icon), [
    'symbol-interface',
    'symbol-interface',
    'symbol-function',
    'symbol-operator',
  ]);
  assert.deepEqual(templateNodes.map(({ iconColor }) => iconColor), [
    'adoInspector.stageTemplateIconForeground',
    'adoInspector.stageTemplateIconForeground',
    'adoInspector.jobTemplateIconForeground',
    'adoInspector.stepTemplateIconForeground',
  ]);
  assert.equal(
    templateNodes[1].offset,
    content.indexOf('template: stages/conditional-stage.yml')
  );
});
