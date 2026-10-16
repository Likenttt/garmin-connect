const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { GarminConnect } = require('../dist');

// Synthetic legacy OAuth tokens only. These tests never read a real session.
function tokens(label = 'original') {
    return {
        oauth1: {
            oauth_token: `synthetic-${label}-oauth1`,
            oauth_token_secret: `synthetic-${label}-secret`,
            unknownField: { zero: 0, empty: null, values: [false, 0] }
        },
        oauth2: {
            access_token: `synthetic-${label}-oauth2`,
            refresh_token: `synthetic-${label}-refresh`,
            scope: 'synthetic-scope',
            expires_at: 0,
            unknownField: { empty: null, value: false }
        }
    };
}

function createClient() {
    const gc = new GarminConnect({
        username: 'synthetic@example.invalid',
        password: 'synthetic-password'
    });
    gc.login = () => assert.fail('Token operations must not log in');
    gc.client.login = () => assert.fail('Token operations must not log in');
    gc.client.get = () => assert.fail('Token operations must not request data');
    return gc;
}

function privateDirectory(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-token-test-'));
    fs.chmodSync(directory, 0o700);
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function writePair(directory, pair) {
    for (const [name, value] of Object.entries(pair)) {
        fs.writeFileSync(
            path.join(directory, `${name}_token.json`),
            JSON.stringify(value),
            { mode: 0o600 }
        );
    }
}

function assertUnchanged(gc, original) {
    assert.strictEqual(gc.client.oauth1Token, original.oauth1);
    assert.strictEqual(gc.client.oauth2Token, original.oauth2);
}

test('inline tokens retain original objects and accept minimal legacy fields without network access', () => {
    const gc = createClient();
    const pair = tokens();
    gc.loadToken(pair.oauth1, pair.oauth2);
    const exported = gc.exportToken();
    assert.strictEqual(exported.oauth1, pair.oauth1);
    assert.strictEqual(exported.oauth2, pair.oauth2);
    assert.deepEqual(exported, tokens());
});

test('file export and import round trip all token fields without changing the source objects', (t) => {
    const directory = privateDirectory(t);
    const original = tokens();
    const gc = createClient();
    gc.loadToken(original.oauth1, original.oauth2);
    gc.exportTokenToFile(directory);
    assertUnchanged(gc, original);
    assert.deepEqual(original, tokens());

    const restored = createClient();
    restored.loadTokenByFile(directory);
    assert.deepEqual(restored.exportToken(), original);
    assert.notStrictEqual(restored.client.oauth1Token, original.oauth1);
    assert.notStrictEqual(restored.client.oauth2Token, original.oauth2);
});

test('loading a missing session directory preserves the active token pair', (t) => {
    const directory = privateDirectory(t);
    const gc = createClient();
    const original = tokens();
    gc.loadToken(original.oauth1, original.oauth2);
    assert.throws(
        () => gc.loadTokenByFile(path.join(directory, 'missing')),
        /Directory not found/
    );
    assertUnchanged(gc, original);
});

test('either missing token file preserves both active tokens and the original filesystem error', (t) => {
    const directory = privateDirectory(t);
    for (const missing of ['oauth1', 'oauth2']) {
        const caseDirectory = path.join(directory, missing);
        fs.mkdirSync(caseDirectory, { mode: 0o700 });
        writePair(caseDirectory, tokens('replacement'));
        fs.unlinkSync(path.join(caseDirectory, `${missing}_token.json`));
        const gc = createClient();
        const original = tokens();
        gc.loadToken(original.oauth1, original.oauth2);
        assert.throws(() => gc.loadTokenByFile(caseDirectory), {
            code: 'ENOENT'
        });
        assertUnchanged(gc, original);
    }
});

test('invalid JSON in either file preserves the complete active token pair', (t) => {
    const directory = privateDirectory(t);
    for (const malformed of ['oauth1', 'oauth2']) {
        writePair(directory, tokens('replacement'));
        fs.writeFileSync(
            path.join(directory, `${malformed}_token.json`),
            '{invalid synthetic json',
            { mode: 0o600 }
        );
        const gc = createClient();
        const original = tokens();
        gc.loadToken(original.oauth1, original.oauth2);
        assert.throws(() => gc.loadTokenByFile(directory), SyntaxError);
        assertUnchanged(gc, original);
    }
});

test('valid JSON with invalid token structure does not replace either active token', (t) => {
    const directory = privateDirectory(t);
    const replacements = [
        { oauth1: null, oauth2: tokens().oauth2 },
        { oauth1: [], oauth2: tokens().oauth2 },
        { oauth1: { oauth_token: 'synthetic' }, oauth2: tokens().oauth2 },
        { oauth1: tokens('replacement').oauth1, oauth2: null },
        { oauth1: tokens('replacement').oauth1, oauth2: [] },
        { oauth1: tokens('replacement').oauth1, oauth2: { access_token: '' } }
    ];
    for (const replacement of replacements) {
        writePair(directory, replacement);
        const gc = createClient();
        const original = tokens();
        gc.loadToken(original.oauth1, original.oauth2);
        assert.throws(() => gc.loadTokenByFile(directory));
        assertUnchanged(gc, original);
    }
});

test('invalid inline tokens are rejected before mutation, including absent, empty and non-string values', () => {
    const invalidValues = [undefined, null, '', ' \t\n ', 0, true, {}];
    const pairs = [
        [null, tokens().oauth2],
        [[], tokens().oauth2],
        ['invalid', tokens().oauth2],
        [tokens().oauth1, null],
        [tokens().oauth1, []],
        [tokens().oauth1, 'invalid']
    ];
    for (const value of invalidValues) {
        pairs.push(
            [{ ...tokens().oauth1, oauth_token: value }, tokens().oauth2],
            [
                { ...tokens().oauth1, oauth_token_secret: value },
                tokens().oauth2
            ],
            [tokens().oauth1, { ...tokens().oauth2, access_token: value }]
        );
    }
    for (const [oauth1, oauth2] of pairs) {
        const gc = createClient();
        const original = tokens();
        gc.loadToken(original.oauth1, original.oauth2);
        assert.throws(() => gc.loadToken(oauth1, oauth2));
        assertUnchanged(gc, original);
    }
});

test('missing export tokens fail before creating a directory or replacing any existing file', (t) => {
    const directory = privateDirectory(t);
    for (const missing of ['oauth1', 'oauth2']) {
        const gc = createClient();
        const pair = tokens();
        gc.client.oauth1Token = pair.oauth1;
        gc.client.oauth2Token = pair.oauth2;
        gc.client[`${missing}Token`] = undefined;
        assert.throws(() => gc.exportToken(), /Token not found/);
        const newDirectory = path.join(directory, `new-${missing}`);
        assert.throws(
            () => gc.exportTokenToFile(newDirectory),
            /Token not found/
        );
        assert.equal(fs.existsSync(newDirectory), false);

        writePair(directory, tokens('saved'));
        const oldFiles = ['oauth1', 'oauth2'].map((name) =>
            fs.readFileSync(path.join(directory, `${name}_token.json`), 'utf8')
        );
        assert.throws(() => gc.exportTokenToFile(directory), /Token not found/);
        assert.deepEqual(
            ['oauth1', 'oauth2'].map((name) =>
                fs.readFileSync(
                    path.join(directory, `${name}_token.json`),
                    'utf8'
                )
            ),
            oldFiles
        );
    }
});

test('invalid export token fields are rejected before touching the filesystem', (t) => {
    const directory = privateDirectory(t);
    const gc = createClient();
    const pair = tokens();
    gc.client.oauth1Token = pair.oauth1;
    gc.client.oauth2Token = { ...pair.oauth2, access_token: '  ' };
    assert.throws(() => gc.exportToken());
    const newDirectory = path.join(directory, 'invalid-export');
    assert.throws(() => gc.exportTokenToFile(newDirectory));
    assert.equal(fs.existsSync(newDirectory), false);
    assert.deepEqual(fs.readdirSync(directory), []);
});

test(
    'new token directories and files use owner-only POSIX permissions without changing parent permissions',
    {
        skip: process.platform === 'win32'
    },
    (t) => {
        const directory = privateDirectory(t);
        const parent = path.join(directory, 'existing-parent');
        fs.mkdirSync(parent, { mode: 0o755 });
        fs.chmodSync(parent, 0o755);
        const session = path.join(parent, 'session');
        const gc = createClient();
        const pair = tokens();
        gc.loadToken(pair.oauth1, pair.oauth2);
        gc.exportTokenToFile(session);
        assert.equal(fs.statSync(parent).mode & 0o777, 0o755);
        assert.equal(fs.statSync(session).mode & 0o777, 0o700);
        for (const name of ['oauth1', 'oauth2']) {
            assert.equal(
                fs.statSync(path.join(session, `${name}_token.json`)).mode &
                    0o777,
                0o600
            );
        }
    }
);

test(
    'export tightens existing token file permissions while preserving an existing directory mode',
    {
        skip: process.platform === 'win32'
    },
    (t) => {
        const directory = privateDirectory(t);
        const session = path.join(directory, 'existing-session');
        fs.mkdirSync(session, { mode: 0o755 });
        fs.chmodSync(session, 0o755);
        writePair(session, tokens('old'));
        for (const name of ['oauth1', 'oauth2']) {
            fs.chmodSync(path.join(session, `${name}_token.json`), 0o666);
        }
        const gc = createClient();
        const pair = tokens();
        gc.loadToken(pair.oauth1, pair.oauth2);
        gc.exportTokenToFile(session);
        assert.equal(fs.statSync(session).mode & 0o777, 0o755);
        for (const name of ['oauth1', 'oauth2']) {
            assert.equal(
                fs.statSync(path.join(session, `${name}_token.json`)).mode &
                    0o777,
                0o600
            );
        }
    }
);

test('export preserves filesystem write errors without changing in-memory tokens', (t) => {
    const directory = privateDirectory(t);
    fs.mkdirSync(path.join(directory, 'oauth1_token.json'), { mode: 0o700 });
    const gc = createClient();
    const pair = tokens();
    gc.loadToken(pair.oauth1, pair.oauth2);
    assert.throws(() => gc.exportTokenToFile(directory), { code: 'EISDIR' });
    assertUnchanged(gc, pair);
    assert.equal(
        fs.existsSync(path.join(directory, 'oauth2_token.json')),
        false
    );
});
