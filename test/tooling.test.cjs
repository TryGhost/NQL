const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createRequire} = require('node:module');
const {dirname, join} = require('node:path');
const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {execFileSync} = require('node:child_process');

test('MySQL test suites use separate databases under the current environment', () => {
    const databases = ['nql', 'mongo-knex'].map((name) => {
        // Load each suite's real config in its own process, including CI overrides.
        const output = execFileSync(process.execPath, ['-e',
            "process.stdout.write(JSON.stringify(require('./test/config').get('database')));"
        ], {
            cwd: join(__dirname, '../packages', name),
            env: {...process.env, NODE_ENV: 'testing-mysql'},
            encoding: 'utf8'
        });
        const config = JSON.parse(output);
        assert.equal(config.client, 'mysql2');
        assert.ok(config.connection.database);
        return config.connection.database;
    });

    assert.notEqual(databases[0], databases[1],
        'NQL and mongo-knex create/drop the same table names and must use separate MySQL databases');
});

// These internal imports deliberately target the Nx version patched in this repo.
// An Nx update must rerun these tests before removing or replacing the patch.
const nxRoot = dirname(require.resolve('nx/package.json'));
const nxRequire = createRequire(join(nxRoot, 'package.json'));
const {findMatchingProjects, getMatchingStringsWithCache} = require(join(nxRoot, 'dist/src/utils/find-matching-projects'));

const projects = {
    '@tryghost/nql': {data: {root: 'packages/nql', tags: ['type:parser']}},
    '@tryghost/nql-lang': {data: {root: 'packages/nql-lang', tags: ['type:parser', 'private']}},
    '@tryghost/mongo-knex': {data: {root: 'packages/mongo-knex', tags: ['type:sql']}},
    '@tryghost/mongo-utils': {data: {root: 'packages/mongo-utils', tags: ['type:utils']}},
    '.hidden': {data: {root: '.tools/hidden', tags: ['.internal']}}
};
const allPackages = Object.keys(projects).filter(name => name.startsWith('@tryghost/'));

for (const [patterns, expected] of [
    [['packages/*'], allPackages], // The release.projects configuration in nx.json.
    [['@tryghost/*'], allPackages],
    [['name:@tryghost/nql*'], ['@tryghost/nql', '@tryghost/nql-lang']],
    [['directory:packages/mongo-*'], ['@tryghost/mongo-knex', '@tryghost/mongo-utils']],
    [['tag:type:p*'], ['@tryghost/nql', '@tryghost/nql-lang']],
    [['tag:.internal'], ['.hidden']],
    [['directory:.tools/*'], ['.hidden']],
    [['@tryghost/{nql,mongo-utils}'], ['@tryghost/nql', '@tryghost/mongo-utils']],
    [['@tryghost/@(nql|mongo-utils)'], ['@tryghost/nql', '@tryghost/mongo-utils']],
    [['@tryghost/*', '!@tryghost/mongo-*'], ['@tryghost/nql', '@tryghost/nql-lang']],
    [['!tag:private'], ['@tryghost/nql', '@tryghost/mongo-knex', '@tryghost/mongo-utils', '.hidden']],
    [['name:missing-*'], []],
    [['@tryghost/nql'], ['@tryghost/nql']],
    [['nql'], ['@tryghost/nql']], // Preserve the separate non-glob name matcher.
    [[], []]
]) {
    test(`Nx selects projects for ${JSON.stringify(patterns)}`, () => {
        assert.deepEqual(findMatchingProjects([...patterns], projects), expected);
    });
}

for (const [pattern, candidates, expected] of [
    ['packages/*', ['packages/nql', 'packages/nql/index.js', 'other/nql'], ['packages/nql']],
    ['packages/**', ['packages/nql', 'packages/nql/index.js', 'other/nql'], ['packages/nql', 'packages/nql/index.js']],
    ['**/*.js', ['a.js', 'src/a.js', '.hidden/a.js', 'a.ts'], ['a.js', 'src/a.js', '.hidden/a.js']],
    ['release/{1,2}.x', ['release/1.x', 'release/2.x', 'release/3.x'], ['release/1.x', 'release/2.x']],
    ['release/[12].x', ['release/1.x', 'release/2.x', 'release/3.x'], ['release/1.x', 'release/2.x']],
    ['!private/*', ['private/a', 'public/a'], ['public/a']],
    ['a/\\*.js', ['a/*.js', 'a/x.js'], ['a/*.js']],
    ['@(main|develop)', ['main', 'develop', 'feature/a'], ['main', 'develop']],
    ['packages/*', ['packages/*'], ['packages/*']]
]) {
    test(`Nx cached matching preserves ${pattern}`, () => {
        assert.deepEqual(getMatchingStringsWithCache(pattern, candidates), expected);
        assert.deepEqual(getMatchingStringsWithCache(pattern, [...candidates].reverse()), [...expected].reverse());
        assert.deepEqual(getMatchingStringsWithCache(pattern, []), []);
    });
}

for (const pattern of ['', '#comment']) {
    test(`Nx rejects an empty compiled matcher: ${JSON.stringify(pattern)}`, () => {
        assert.throws(() => getMatchingStringsWithCache(pattern, ['anything']), /Invalid glob pattern/);
    });
}

for (const asynchronous of [false, true]) {
    test(`Nx generator ${asynchronous ? 'async' : 'sync'} glob overlays pending tree changes`, async (t) => {
        const context = require(join(nxRoot, 'dist/src/utils/workspace-context'));
        const {glob, globAsync} = require(join(nxRoot, 'dist/src/generators/utils/glob'));
        const existing = ['src/keep.js', 'src/deleted.js', 'src/updated.js'];
        t.mock.method(context, 'globWithWorkspaceContextSync', () => [...existing]);
        t.mock.method(context, 'globWithWorkspaceContext', async () => [...existing]);
        const tree = {
            root: process.cwd(),
            listChanges: () => [
                {type: 'CREATE', path: 'src/new.js'},
                {type: 'CREATE', path: 'src/new.ts'},
                {type: 'CREATE', path: 'src/nested/new.js'},
                {type: 'CREATE', path: 'src/.hidden.js'},
                {type: 'CREATE', path: 'other/new.js'},
                {type: 'UPDATE', path: 'src/updated.js'},
                {type: 'DELETE', path: 'src/deleted.js'}
            ]
        };
        const result = await (asynchronous ? globAsync(tree, ['src/**/*.js', 'src/**/*.ts']) : glob(tree, ['src/**/*.js', 'src/**/*.ts']));
        assert.deepEqual(result.sort(), ['src/keep.js', 'src/updated.js', 'src/new.js', 'src/new.ts', 'src/nested/new.js'].sort());
    });
}

const branchCases = [
    [true, 'feature/a', true],
    [false, 'main', false],
    [undefined, 'main', false],
    [['main'], 'main', true],
    [['main'], 'feature/a', false],
    [['release/*'], 'release/1.x', true],
    [['release/*'], 'release/1.x/hotfix', false],
    [['release/**'], 'release/1.x/hotfix', true],
    [['{main,release/*}'], 'release/1.x', true],
    [['@(main|develop)'], 'main', true],
    [['*'], '.hidden', true],
    [['!feature/*'], 'main', true],
    [['!feature/*'], 'feature/a', false],
    [['#comment', ''], 'main', false],
    [[], 'main', false]
];
for (const [patterns, branch, allBranches] of branchCases) {
    test(`Nx release branch ${branch} with ${JSON.stringify(patterns)}`, async (t) => {
        const exec = require(join(nxRoot, 'dist/src/command-line/release/utils/exec-command'));
        const {RepoGitTags} = require(join(nxRoot, 'dist/src/command-line/release/utils/repository-git-tags'));
        const commands = [];
        t.mock.method(exec, 'execCommand', async (command, args) => {
            assert.equal(command, 'git');
            commands.push(args);
            return args[0] === 'rev-parse' ? `${branch}\n` : 'nql@0.13.4\n';
        });
        const tags = RepoGitTags.create();
        assert.deepEqual(await tags.resolveTags(patterns), ['nql@0.13.4']);
        const tagCommands = () => commands.filter(args => args.includes('tag'));
        assert.equal(tagCommands().length, 1);
        assert.equal(tagCommands()[0].includes('--merged'), !allBranches);
        await tags.resolveTags(patterns);
        assert.equal(tagCommands().length, 1, 'tag results are cached');
        tags.clean();
        await tags.resolveTags(patterns);
        assert.equal(tagCommands().length, 2, 'clean invalidates the cache');
    });
}

test('Nx release falls back to tags from all branches when no merged tags exist', async (t) => {
    const exec = require(join(nxRoot, 'dist/src/command-line/release/utils/exec-command'));
    const {RepoGitTags} = require(join(nxRoot, 'dist/src/command-line/release/utils/repository-git-tags'));
    const commands = [];
    t.mock.method(exec, 'execCommand', async (command, args) => {
        commands.push(args);
        return args.includes('--merged') ? '' : 'nql@0.13.4\n';
    });
    assert.deepEqual(await RepoGitTags.create().resolveTags(), ['nql@0.13.4']);
    assert.equal(commands.length, 2);
    assert.ok(commands[0].includes('--merged'));
    assert.ok(!commands[1].includes('--merged'));
});

function fixture(t) {
    const cwd = mkdtempSync(join(tmpdir(), 'nql-tooling-'));
    t.after(() => rmSync(cwd, {recursive: true, force: true}));
    for (const file of ['src/index.js', 'src/nested/util.js', 'src/ignore.js', 'test/unit/a.test.js', 'test/integration/b.test.js', 'test/helper.js', 'node_modules/pkg/index.js']) {
        mkdirSync(dirname(join(cwd, file)), {recursive: true});
        writeFileSync(join(cwd, file), 'module.exports = {};\n');
    }
    return cwd;
}

test('Mocha discovers nested test files and applies glob ignores', (t) => {
    const workspaceRequire = createRequire(join(__dirname, '../packages/mongo-utils/package.json'));
    const mochaRequire = createRequire(workspaceRequire.resolve('mocha/package.json'));
    const {lookupFiles} = mochaRequire('./lib/cli/lookup-files');
    const {minimatch} = mochaRequire('minimatch');
    const cwd = fixture(t);
    const files = lookupFiles(`${cwd}/test/**/*.test.js`, ['js'], false).sort();
    assert.deepEqual(files, [join(cwd, 'test/integration/b.test.js'), join(cwd, 'test/unit/a.test.js')]);
    assert.deepEqual(files.filter(file => !minimatch(file, '**/integration/**')), [join(cwd, 'test/unit/a.test.js')]);
});

test('c8 test-exclude preserves coverage file discovery and exclusions', async (t) => {
    const workspaceRequire = createRequire(join(__dirname, '../packages/mongo-utils/package.json'));
    const c8Require = createRequire(workspaceRequire.resolve('c8/package.json'));
    const TestExclude = c8Require('test-exclude');
    const cwd = fixture(t);
    const exclude = new TestExclude({cwd, include: ['src/**/*.js'], exclude: ['src/ignore.js'], extension: ['.js']});
    const expected = ['src/index.js', 'src/nested/util.js'];
    assert.deepEqual(exclude.globSync().sort(), expected);
    assert.deepEqual((await exclude.glob()).sort(), expected);
    for (const file of expected) {
        assert.equal(exclude.shouldInstrument(join(cwd, file)), true);
    }
    for (const file of ['src/ignore.js', 'test/unit/a.test.js', 'node_modules/pkg/index.js']) {
        assert.equal(exclude.shouldInstrument(join(cwd, file)), false);
    }
});

test('Minimatch loads through CommonJS and rejects excessive pattern expansion', () => {
    const {Minimatch, minimatch} = nxRequire('minimatch');
    assert.equal(minimatch('packages/nql', 'packages/*'), true);
    assert.throws(() => new Minimatch('a/**/../b/c', {braceExpandMax: 1, optimizationLevel: 2}), RangeError);
});
