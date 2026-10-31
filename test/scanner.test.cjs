const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CachingRegistry } = require('../out/caching/CachingRegistry');
const { TemplateScanner } = require('../out/scanner/TemplateScanner');
const { YamlValidator } = require('../out/validation/YamlValidator');

const pipelineRoot = path.resolve(__dirname, '..', 'test-data', 'pipelines');
const config = {
  maxDepth: 3,
  minDepth: 0,
  includePatterns: ['*.yml', '*.yaml'],
  excludePatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
};

test('scans nested template references and respects maxDepth', async (t) => {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const cache = new CachingRegistry(cacheDirectory, 100, true);
  const scanner = new TemplateScanner(cache, pipelineRoot);
  const result = await scanner.scan('deploy.yml', config);

  assert.ok(result.errors.some((error) => error.message.includes('use "parameters:", not "parameter:"')));
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

test('reports unknown, missing, and incorrectly typed template parameters', async (t) => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-params-'));
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(fixtureRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(fixtureRoot, 'main.yml'),
    'steps:\n  - template: child.yml\n    parameters:\n      count: four\n      extra: true\n'
  );
  await fs.writeFile(
    path.join(fixtureRoot, 'child.yml'),
    'parameters:\n  - name: count\n    type: number\n  - name: required\n    type: string\nsteps: []\n'
  );

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    fixtureRoot
  );
  const result = await scanner.scan('main.yml', { ...config, maxDepth: 1 });
  const messages = result.errors.map((error) => error.message);

  assert.ok(messages.some((message) => message.includes('does not declare parameter "extra"')));
  assert.ok(messages.some((message) => message.includes('expects number')));
  assert.ok(messages.some((message) => message.includes('Required template parameter "required"')));
  assert.ok(result.errors.every((error) => error.line > 0));
});

test('validates reference syntax at maxDepth without descending past it', async (t) => {
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ado-yaml-cache-'));
  t.after(() => fs.rm(cacheDirectory, { recursive: true, force: true }));

  const scanner = new TemplateScanner(
    new CachingRegistry(cacheDirectory, 100, true),
    pipelineRoot
  );
  const result = await scanner.scan('deploy.yml', { ...config, maxDepth: 3 });

  assert.ok(result.errors.some((error) => error.message.includes('use "parameters:", not "parameter:"')));
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
});

test('validates multi-document pipeline YAML without false parse errors', async () => {
  const content = await fs.readFile(path.join(pipelineRoot, 'deploy.yml'), 'utf8');
  const diagnostics = new YamlValidator().validate(content, 'deploy.yml');

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'PARSE_ERROR'), false);
});
