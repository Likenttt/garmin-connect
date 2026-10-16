const assert = require('node:assert/strict');
const test = require('node:test');
const { AxiosError, isAxiosError } = require('axios');
const { GarminConnect } = require('../dist');

// Synthetic fixtures: no Garmin account data or credentials are used.
const hrvFixture = {
    hrvSummary: {
        calendarDate: '2026-10-08',
        weeklyAvg: 0,
        lastNightAvg: null,
        baseline: { lowUpper: 42, balancedLow: 43, balancedUpper: 70 },
        status: 'BALANCED',
        futureSummaryField: { value: null }
    },
    hrvReadings: [
        { readingTimeGMT: '2026-10-07T16:00:00.0', hrvValue: 0 },
        { readingTimeGMT: '2026-10-07T16:05:00.0', hrvValue: null },
        { readingTimeGMT: '2026-10-07T16:10:00.0', hrvValue: 51 }
    ],
    futureField: { samples: [0, null, 1] }
};

function createClient(domain = 'garmin.com', response = {}) {
    const gc = new GarminConnect(
        { username: 'test@example.com', password: 'test' },
        domain
    );
    const requests = [];
    gc.client.get = async (url, config) => {
        requests.push({ url, config });
        if (response instanceof Error) throw response;
        return response;
    };
    return { gc, requests };
}

function localDateString(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

const operations = [
    ['getHrvData', ['2026-10-08']],
    ['getHrvSummaries', ['2026-10-01', '2026-10-08']],
    ['getStressData', ['2026-10-08']],
    ['getStressSummaries', ['2026-10-01', '2026-10-08']],
    ['getBodyBattery', ['2026-10-01', '2026-10-08']],
    ['getTrainingReadiness', ['2026-10-08']]
];

test('health endpoints use the selected CN or global API host and exact date parameters', async () => {
    const routes = [
        ['/hrv-service/hrv/2026-10-08', undefined],
        ['/hrv-service/hrv/daily/2026-10-01/2026-10-08', undefined],
        ['/wellness-service/wellness/dailyStress/2026-10-08', undefined],
        [
            '/usersummary-service/stats/stress/daily/2026-10-01/2026-10-08',
            undefined
        ],
        [
            '/wellness-service/wellness/bodyBattery/reports/daily',
            { startDate: '2026-10-01', endDate: '2026-10-08' }
        ],
        ['/metrics-service/metrics/trainingreadiness/2026-10-08', undefined]
    ];

    for (const domain of ['garmin.cn', 'garmin.com']) {
        const { gc, requests } = createClient(domain);
        for (const [index, [method, args]] of operations.entries()) {
            await gc[method](...args);
            const request = requests[index];
            assert.equal(
                request.url,
                `https://connectapi.${domain}${routes[index][0]}`
            );
            assert.deepEqual(request.config?.params, routes[index][1]);
        }
        assert.equal(requests.length, operations.length);
    }
});

test('daily HRV preserves readings, zero values, nulls and unknown fields', async () => {
    const { gc } = createClient('garmin.com', hrvFixture);
    assert.strictEqual(await gc.getHrvData('2026-10-08'), hrvFixture);
});

test('HRV summaries preserve the response and request a wide range once', async () => {
    const summaries = {
        hrvSummaries: [hrvFixture.hrvSummary],
        futureSummaryField: { values: [0, null] }
    };
    const { gc, requests } = createClient('garmin.com', summaries);
    assert.strictEqual(
        await gc.getHrvSummaries('2026-01-01', '2026-10-08'),
        summaries
    );
    assert.equal(requests.length, 1);
    assert.equal(
        requests[0].url,
        'https://connectapi.garmin.com/hrv-service/hrv/daily/2026-01-01/2026-10-08'
    );
});

test('stress preserves its full time series and unrecognized response fields', async () => {
    const stress = {
        calendarDate: '2026-10-08',
        avgStressLevel: 0,
        stressValuesArray: [
            [0, 0],
            [300000, null],
            [600000, -1]
        ],
        futureField: { intervals: [0, null] }
    };
    const { gc } = createClient('garmin.com', stress);
    assert.strictEqual(await gc.getStressData('2026-10-08'), stress);

    const summaries = [
        { calendarDate: '2026-10-08', values: { overall: 0, rest: null } },
        { calendarDate: '2026-10-09', values: { futureField: { value: 42 } } }
    ];
    const summaryClient = createClient('garmin.com', summaries).gc;
    assert.strictEqual(
        await summaryClient.getStressSummaries('2026-10-08', '2026-10-09'),
        summaries
    );
});

test('Body Battery and training readiness return complete lists without compression', async () => {
    const bodyBattery = [
        {
            date: '2026-10-08',
            charged: 0,
            drained: null,
            bodyBatteryValuesArray: [
                [0, 0],
                [300000, 42]
            ],
            futureField: { value: null }
        },
        { date: '2026-10-09', bodyBatteryValuesArray: [] }
    ];
    const readiness = [
        { calendarDate: '2026-10-08', score: 0, recoveryTime: null },
        { calendarDate: '2026-10-08', score: 80, futureField: { value: 0 } }
    ];
    const bodyClient = createClient('garmin.com', bodyBattery).gc;
    const readinessClient = createClient('garmin.com', readiness).gc;
    assert.strictEqual(
        await bodyClient.getBodyBattery('2026-10-08', '2026-10-09'),
        bodyBattery
    );
    assert.strictEqual(
        await readinessClient.getTrainingReadiness('2026-10-08'),
        readiness
    );
    const readinessObject = readiness[0];
    const objectClient = createClient('garmin.com', readinessObject).gc;
    assert.strictEqual(
        await objectClient.getTrainingReadiness('2026-10-08'),
        readinessObject
    );
});

test('no-content responses become null while actual empty arrays and objects are preserved', async () => {
    for (const [method, args] of operations) {
        for (const empty of [null, undefined, '']) {
            const { gc } = createClient('garmin.com', empty);
            // An explicit undefined must reach the stub, rather than the helper default.
            gc.client.get = async () => empty;
            assert.strictEqual(await gc[method](...args), null, method);
        }
        for (const empty of [[], {}]) {
            const { gc } = createClient('garmin.com', empty);
            assert.strictEqual(await gc[method](...args), empty, method);
        }
    }
});

test('HTTP failures propagate with their original identity, including unsupported dates or devices', async () => {
    for (const [method, args] of operations) {
        for (const status of [401, 403, 404, 429]) {
            const error = Object.assign(new Error(`Synthetic HTTP ${status}`), {
                response: { status, data: { message: 'synthetic error' } }
            });
            const { gc, requests } = createClient('garmin.com', error);
            await assert.rejects(
                () => gc[method](...args),
                (actual) => actual === error
            );
            assert.equal(requests.length, 1, `${method} HTTP ${status}`);
        }
    }
});

test('the Axios transport preserves unauthenticated HTTP error identity and status', async () => {
    for (const status of [401, 403, 404, 429]) {
        const gc = new GarminConnect({
            username: 'test@example.com',
            password: 'test'
        });
        assert.equal(gc.client.oauth2Token, undefined);
        let originalError;
        let requestCount = 0;
        gc.client.client.defaults.adapter = async (config) => {
            requestCount++;
            const response = {
                status,
                statusText: `Synthetic HTTP ${status}`,
                data: { message: 'synthetic adapter error' },
                headers: {},
                config
            };
            originalError = new AxiosError(
                response.statusText,
                AxiosError.ERR_BAD_REQUEST,
                config,
                undefined,
                response
            );
            throw originalError;
        };

        await assert.rejects(
            () => gc.getHrvData('2026-10-08'),
            (error) => {
                assert.strictEqual(error, originalError);
                assert.ok(isAxiosError(error));
                assert.equal(error.response.status, status);
                return true;
            }
        );
        assert.equal(requestCount, 1);
    }
});

test('the Axios transport converts an HTTP 204 empty body to null', async () => {
    const gc = new GarminConnect({
        username: 'test@example.com',
        password: 'test'
    });
    let requestCount = 0;
    gc.client.client.defaults.adapter = async (config) => {
        requestCount++;
        return {
            status: 204,
            statusText: 'No Content',
            data: '',
            headers: {},
            config
        };
    };
    assert.strictEqual(await gc.getHrvData('2026-10-08'), null);
    assert.equal(requestCount, 1);
});

test('invalid strings and invalid Date objects fail before any request is sent', async () => {
    const invalidDates = [
        '2026-2-08',
        '2026-10-8',
        '2026-10-08T00:00:00Z',
        ' 2026-10-08',
        '2026-10-08 ',
        '',
        '2026-02-29',
        '1900-02-29',
        '2026-04-31',
        '2026-00-08',
        '2026-13-08',
        '2026-10-00',
        new Date(NaN)
    ];
    for (const method of [
        'getHrvData',
        'getStressData',
        'getTrainingReadiness'
    ]) {
        for (const date of invalidDates) {
            const { gc, requests } = createClient();
            await assert.rejects(async () => gc[method](date));
            assert.equal(requests.length, 0, method);
        }
    }
    for (const method of [
        'getHrvSummaries',
        'getStressSummaries',
        'getBodyBattery'
    ]) {
        for (const date of invalidDates) {
            for (const args of [
                [date, '2026-10-08'],
                ['2026-10-08', date]
            ]) {
                const { gc, requests } = createClient();
                await assert.rejects(async () => gc[method](...args));
                assert.equal(requests.length, 0, method);
            }
        }
    }
});

test('calendar validation accepts real leap days and rejects reversed ranges without requests', async () => {
    for (const date of ['2000-02-29', '2024-02-29', '2026-10-08']) {
        const { gc, requests } = createClient();
        await gc.getHrvData(date);
        assert.ok(requests[0].url.endsWith(`/${date}`));
        await gc.getHrvSummaries(date, date);
        assert.ok(requests[1].url.endsWith(`/${date}/${date}`));
    }
    for (const method of [
        'getHrvSummaries',
        'getStressSummaries',
        'getBodyBattery'
    ]) {
        const { gc, requests } = createClient();
        await assert.rejects(async () =>
            gc[method]('2026-10-09', '2026-10-08')
        );
        assert.equal(requests.length, 0, method);
    }
});

test('Date inputs use the local calendar date rather than the UTC date', async (t) => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'Asia/Shanghai';
    t.after(() => {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    });
    const date = new Date('2026-10-07T16:30:00Z');
    assert.equal(localDateString(date), '2026-10-08');
    const { gc, requests } = createClient();
    await gc.getHrvData(date);
    await gc.getHrvSummaries(date, date);
    await gc.getStressData(date);
    await gc.getStressSummaries(date, date);
    await gc.getBodyBattery(date);
    await gc.getTrainingReadiness(date);
    assert.ok(requests[0].url.endsWith('/2026-10-08'));
    assert.ok(requests[1].url.endsWith('/2026-10-08/2026-10-08'));
    assert.ok(requests[2].url.endsWith('/2026-10-08'));
    assert.ok(requests[3].url.endsWith('/2026-10-08/2026-10-08'));
    assert.deepEqual(requests[4].config.params, {
        startDate: '2026-10-08',
        endDate: '2026-10-08'
    });
    assert.ok(requests[5].url.endsWith('/2026-10-08'));
});

test('omitted dates default to today and Body Battery end defaults to the selected start', async () => {
    const today = localDateString(new Date());
    const { gc, requests } = createClient();
    await gc.getHrvData();
    await gc.getStressData();
    await gc.getBodyBattery();
    await gc.getTrainingReadiness();
    assert.ok(requests[0].url.endsWith(`/${today}`));
    assert.ok(requests[1].url.endsWith(`/${today}`));
    assert.deepEqual(requests[2].config.params, {
        startDate: today,
        endDate: today
    });
    assert.ok(requests[3].url.endsWith(`/${today}`));
    await gc.getBodyBattery('2024-02-29');
    assert.deepEqual(requests[4].config.params, {
        startDate: '2024-02-29',
        endDate: '2024-02-29'
    });
});
