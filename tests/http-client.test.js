const assert = require('node:assert/strict');
const test = require('node:test');
const { AxiosError, CanceledError } = require('axios');
const { HttpClient } = require('../dist/common/HttpClient');
const { UrlClass } = require('../dist/garmin/UrlClass');

// Every adapter and token in this suite is synthetic. No network or session files.
function createHttpClient(accessToken = 'synthetic-old') {
    const http = new HttpClient(new UrlClass());
    if (accessToken !== null) http.oauth2Token = token(accessToken);
    return http;
}

function token(accessToken) {
    return { access_token: accessToken, expires_at: 0 };
}

function response(config, data, status = 200) {
    return { config, data, status, statusText: 'Synthetic', headers: {} };
}

function httpError(config, status = 401) {
    return new AxiosError(
        `Synthetic HTTP ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response(config, { synthetic: true }, status)
    );
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function bounded(promise) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error('Synthetic request did not settle')),
                    500
                );
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

test('concurrent requests for one account refresh once and all use its new token', async () => {
    const http = createHttpClient();
    const refresh = deferred();
    const refreshStarted = deferred();
    const rejectedRequests = deferred();
    let refreshCount = 0;
    let rejectionCount = 0;
    let requestCount = 0;
    http.refreshOauth2Token = async () => {
        refreshCount++;
        refreshStarted.resolve();
        await refresh.promise;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        requestCount++;
        if (config.headers.Authorization !== 'Bearer synthetic-new') {
            if (++rejectionCount === 3) rejectedRequests.resolve();
            throw httpError(config);
        }
        return response(config, config.headers.Authorization);
    };
    const pending = Promise.all(
        ['/one', '/two', '/three'].map((url) => http.get(url))
    );
    await bounded(
        Promise.all([refreshStarted.promise, rejectedRequests.promise])
    );
    refresh.resolve();
    assert.deepEqual(
        await bounded(pending),
        Array(3).fill('Bearer synthetic-new')
    );
    assert.equal(refreshCount, 1);
    assert.equal(requestCount, 6);
});

test('accounts refresh independently and never replay another account or an old token', async () => {
    const first = createHttpClient('synthetic-first-old');
    const second = createHttpClient('synthetic-second-old');
    const firstRefresh = deferred();
    const firstStarted = deferred();
    let firstRefreshCount = 0;
    let secondRefreshCount = 0;
    first.refreshOauth2Token = async () => {
        firstRefreshCount++;
        firstStarted.resolve();
        await firstRefresh.promise;
        first.oauth2Token = token('synthetic-first-new');
    };
    second.refreshOauth2Token = async () => {
        secondRefreshCount++;
        second.oauth2Token = token('synthetic-second-new');
    };
    for (const http of [first, second]) {
        let requests = 0;
        http.client.defaults.adapter = async (config) => {
            if (++requests === 1) throw httpError(config);
            return response(config, config.headers.Authorization);
        };
    }
    const firstRequest = first.get('/first');
    await bounded(firstStarted.promise);
    const secondRequest = second.get('/second');
    let firstResult;
    try {
        // The second account can finish while the first refresh is still blocked.
        assert.equal(
            await bounded(secondRequest),
            'Bearer synthetic-second-new'
        );
    } finally {
        firstRefresh.resolve();
        firstResult = await bounded(firstRequest);
    }
    assert.equal(firstResult, 'Bearer synthetic-first-new');
    assert.equal(firstRefreshCount, 1);
    assert.equal(secondRefreshCount, 1);
});

test('requests arriving while the token is temporarily cleared join its pending refresh', async () => {
    const http = createHttpClient();
    const refresh = deferred();
    const refreshStarted = deferred();
    let refreshCount = 0;
    http.refreshOauth2Token = async () => {
        refreshCount++;
        http.oauth2Token = undefined;
        refreshStarted.resolve();
        await refresh.promise;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        if (config.headers.Authorization !== 'Bearer synthetic-new') {
            throw httpError(config);
        }
        return response(config, config.headers.Authorization);
    };
    const first = http.get('/first');
    await bounded(refreshStarted.promise);
    const second = http.get('/second');
    // Attach handlers before the event loop advances, including the red regression.
    const pending = Promise.allSettled([first, second]);
    await new Promise((resolve) => setImmediate(resolve));
    refresh.resolve();
    const results = await bounded(pending);
    assert.ok(results.every((result) => result.status === 'fulfilled'));
    assert.equal(refreshCount, 1);
});

test('a retried request that is still unauthorized stops after one refresh', async () => {
    const http = createHttpClient();
    let refreshCount = 0;
    const errors = [];
    http.refreshOauth2Token = async () => {
        refreshCount++;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        const error = httpError(config);
        errors.push(error);
        throw error;
    };
    await assert.rejects(
        () => bounded(http.get('/always-401')),
        (error) => error === errors[1]
    );
    assert.equal(refreshCount, 1);
    assert.equal(errors.length, 2);
});

test('waiting requests also retry only once when the refreshed token is rejected', async () => {
    const http = createHttpClient();
    const refresh = deferred();
    const bothFailed = deferred();
    let firstFailures = 0;
    let refreshCount = 0;
    const counts = new Map();
    http.refreshOauth2Token = async () => {
        refreshCount++;
        await refresh.promise;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        const count = (counts.get(config.url) || 0) + 1;
        counts.set(config.url, count);
        if (count === 1 && ++firstFailures === 2) bothFailed.resolve();
        throw httpError(config);
    };
    const pending = Promise.allSettled([http.get('/one'), http.get('/two')]);
    await bounded(bothFailed.promise);
    refresh.resolve();
    const results = await bounded(pending);
    assert.ok(results.every((result) => result.status === 'rejected'));
    assert.equal(refreshCount, 1);
    assert.deepEqual([...counts.values()], [2, 2]);
});

test('401 without a request config preserves the original error instead of crashing', async () => {
    const http = createHttpClient();
    const original = httpError(undefined);
    let refreshCount = 0;
    http.refreshOauth2Token = async () => {
        refreshCount++;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async () => {
        throw original;
    };
    await assert.rejects(
        () => bounded(http.get('/missing-config')),
        (error) => error === original
    );
    assert.equal(refreshCount, 0);
});

test('401 without tokens is rejected unchanged without attempting a refresh', async () => {
    const http = createHttpClient(null);
    let original;
    http.refreshOauth2Token = async () => {
        assert.fail('Unexpected refresh');
    };
    http.client.defaults.adapter = async (config) => {
        original = httpError(config);
        throw original;
    };
    await assert.rejects(
        () => http.get('/unauthenticated'),
        (error) => error === original
    );
});

test('non-401 HTTP errors, timeouts, network errors and cancellation retain identity', async () => {
    for (const original of [
        ...[403, 404, 429, 500].map((status) => httpError(undefined, status)),
        new AxiosError('Synthetic timeout', AxiosError.ECONNABORTED),
        new AxiosError('Synthetic network failure', AxiosError.ERR_NETWORK),
        new CanceledError('Synthetic cancellation')
    ]) {
        const http = createHttpClient();
        http.refreshOauth2Token = async () => {
            assert.fail('Unexpected refresh');
        };
        http.client.defaults.adapter = async () => {
            throw original;
        };
        await assert.rejects(
            () => http.get('/failure'),
            (error) => error === original
        );
    }
});

test('each new request reads the current token and preserves unrelated headers', async () => {
    const http = createHttpClient('synthetic-first');
    const headers = [];
    http.client.defaults.adapter = async (config) => {
        headers.push({
            authorization: config.headers.Authorization,
            custom: config.headers['X-Synthetic']
        });
        return response(config, { ok: true });
    };
    await http.get('/first', { headers: { 'X-Synthetic': 'kept' } });
    http.oauth2Token = token('synthetic-second');
    await http.get('/second', { headers: { 'X-Synthetic': 'kept' } });
    assert.deepEqual(headers, [
        { authorization: 'Bearer synthetic-first', custom: 'kept' },
        { authorization: 'Bearer synthetic-second', custom: 'kept' }
    ]);
});

test('retries preserve the method, body, query, response type and request options', async () => {
    const http = createHttpClient();
    const requests = [];
    http.refreshOauth2Token = async () => {
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        requests.push(config);
        if (requests.length === 1) throw httpError(config);
        return response(config, { updated: true });
    };
    const signal = new AbortController().signal;
    const serializer = (params) => `synthetic=${params.start}`;
    assert.deepEqual(
        await http.put(
            '/settings',
            { enabled: false },
            {
                params: { start: 0, future: null },
                paramsSerializer: serializer,
                timeout: 42,
                responseType: 'json',
                signal,
                headers: { 'X-Synthetic': 'kept' }
            }
        ),
        { updated: true }
    );
    assert.equal(requests.length, 2);
    for (const config of requests) {
        assert.equal(config.method, 'put');
        assert.equal(config.data, '{"enabled":false}');
        assert.deepEqual(config.params, { start: 0, future: null });
        assert.strictEqual(config.paramsSerializer.serialize, serializer);
        assert.equal(config.timeout, 42);
        assert.equal(config.responseType, 'json');
        assert.strictEqual(config.signal, signal);
        assert.equal(config.headers['X-Synthetic'], 'kept');
    }
    assert.equal(requests[1].headers.Authorization, 'Bearer synthetic-new');
});

test('GET POST PUT and delete-override preserve exact response bodies and config', async () => {
    const http = createHttpClient(null);
    const requests = [];
    const bodies = [0, null, false, { future: [0, null] }];
    http.client.defaults.adapter = async (config) => {
        requests.push(config);
        return response(config, bodies[requests.length - 1]);
    };
    const config = { params: { start: 0 }, headers: { 'X-Synthetic': 'kept' } };
    assert.strictEqual(await http.get('/get', config), bodies[0]);
    assert.strictEqual(
        await http.post('/post', { count: 0 }, config),
        bodies[1]
    );
    assert.strictEqual(
        await http.put('/put', { enabled: false }, config),
        bodies[2]
    );
    assert.strictEqual(await http.delete('/delete', config), bodies[3]);
    assert.deepEqual(
        requests.map((request) => request.method),
        ['get', 'post', 'put', 'post']
    );
    assert.equal(requests[3].headers['X-Http-Method-Override'], 'DELETE');
    for (const request of requests) {
        assert.deepEqual(request.params, { start: 0 });
        assert.equal(request.headers['X-Synthetic'], 'kept');
    }
    assert.deepEqual(config, {
        params: { start: 0 },
        headers: { 'X-Synthetic': 'kept' }
    });
});

test('a failed refresh rejects every waiting request and a later request can refresh again', async () => {
    const http = createHttpClient();
    const refresh = deferred();
    const allFailed = deferred();
    const failure = new Error('Synthetic refresh failure');
    let firstFailures = 0;
    let refreshCount = 0;
    http.refreshOauth2Token = async () => {
        refreshCount++;
        if (refreshCount === 1) await refresh.promise;
        else http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        if (config.headers.Authorization !== 'Bearer synthetic-new') {
            if (++firstFailures === 3) allFailed.resolve();
            throw httpError(config);
        }
        return response(config, { ok: true });
    };
    const pending = Promise.allSettled(
        ['/one', '/two', '/three'].map((url) => http.get(url))
    );
    await bounded(allFailed.promise);
    refresh.reject(failure);
    const results = await bounded(pending);
    assert.ok(
        results.every(
            (result) =>
                result.status === 'rejected' && result.reason === failure
        )
    );
    assert.deepEqual(await bounded(http.get('/later')), { ok: true });
    assert.equal(refreshCount, 2);
});

test('a synchronous refresh failure also releases its lock for the next attempt', async () => {
    const http = createHttpClient();
    const failure = new Error('Synthetic synchronous refresh failure');
    let refreshCount = 0;
    http.refreshOauth2Token = () => {
        if (++refreshCount === 1) throw failure;
        http.oauth2Token = token('synthetic-new');
        return Promise.resolve();
    };
    http.client.defaults.adapter = async (config) => {
        if (config.headers.Authorization !== 'Bearer synthetic-new')
            throw httpError(config);
        return response(config, true);
    };
    await assert.rejects(
        () => bounded(http.get('/first')),
        (error) => error === failure
    );
    assert.equal(await bounded(http.get('/second')), true);
    assert.equal(refreshCount, 2);
});

test('a refresh with a missing or blank access token rejects before a retry is sent', async () => {
    for (const invalid of [undefined, '', '   ']) {
        const http = createHttpClient();
        let requests = 0;
        http.refreshOauth2Token = async () => {
            http.oauth2Token = token(invalid);
        };
        http.client.defaults.adapter = async (config) => {
            requests++;
            throw httpError(config);
        };
        await assert.rejects(
            () => bounded(http.get('/invalid-refresh')),
            /access token/i
        );
        assert.equal(requests, 1);
    }
});

test('an unauthorized OAuth exchange rejects its caller without recursively waiting on itself', async () => {
    const http = createHttpClient();
    http.OAUTH_CONSUMER = { key: 'synthetic-key', secret: 'synthetic-secret' };
    http.oauth1Token = {
        oauth_token: 'synthetic-token',
        oauth_token_secret: 'synthetic-secret'
    };
    const exchangeErrors = [];
    let requests = 0;
    http.client.defaults.adapter = async (config) => {
        requests++;
        const error = httpError(config);
        if (config.url.includes('/exchange/user/2.0'))
            exchangeErrors.push(error);
        throw error;
    };
    await assert.rejects(
        () => bounded(http.get('/data')),
        (error) => error === exchangeErrors[0]
    );
    assert.equal(requests, 2);
    assert.equal(exchangeErrors.length, 1);
    assert.equal(http.oauth2Token.access_token, 'synthetic-old');
    http.client.defaults.adapter = async (config) => {
        if (config.url.includes('/exchange/user/2.0')) {
            return response(config, {
                access_token: 'synthetic-new',
                expires_in: 3600,
                refresh_token_expires_in: 7200
            });
        }
        if (config.headers.Authorization !== 'Bearer synthetic-new')
            throw httpError(config);
        return response(config, true);
    };
    assert.equal(await bounded(http.get('/later')), true);
    assert.equal(http.oauth2Token.access_token, 'synthetic-new');
});

test('expiry checks share a pending refresh with unauthorized requests', async () => {
    const http = createHttpClient();
    const refresh = deferred();
    const started = deferred();
    let refreshCount = 0;
    http.refreshOauth2Token = async () => {
        refreshCount++;
        started.resolve();
        await refresh.promise;
        http.oauth2Token = token('synthetic-new');
    };
    http.client.defaults.adapter = async (config) => {
        if (config.headers.Authorization !== 'Bearer synthetic-new')
            throw httpError(config);
        return response(config, true);
    };
    const expiryCheck = http.checkTokenVaild();
    await bounded(started.promise);
    const dataRequest = http.get('/data');
    const pending = Promise.all([expiryCheck, dataRequest]);
    await new Promise((resolve) => setImmediate(resolve));
    refresh.resolve();
    assert.deepEqual(await bounded(pending), [undefined, true]);
    assert.equal(refreshCount, 1);
});
