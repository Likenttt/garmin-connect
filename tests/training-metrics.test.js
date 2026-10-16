const assert = require('node:assert/strict');
const test = require('node:test');
const { GarminConnect } = require('../dist');

// All account names, credentials and responses below are synthetic.
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

const encodedName = ' runner /%?#中文 ';
const operations = [
    ['getDailyTrainingStatus', ['2026-10-08']],
    ['getTrainingStatus', ['2026-10-08']],
    ['getTrainingLoadBalance', ['2026-10-08']],
    ['getMaxMetrics', ['2026-10-08']],
    ['getMaxMetricsRange', ['2026-10-01', '2026-10-08']],
    ['getRacePredictions', [{ displayName: encodedName }]],
    [
        'getRacePredictionsRange',
        ['2026-10-01', '2026-10-08', { displayName: encodedName }]
    ]
];

test('training and race routes use the selected CN or global host with exact query parameters', async () => {
    const routes = [
        ['/metrics-service/metrics/trainingstatus/daily/2026-10-08'],
        ['/metrics-service/metrics/trainingstatus/aggregated/2026-10-08'],
        ['/metrics-service/metrics/trainingloadbalance/latest/2026-10-08'],
        ['/metrics-service/metrics/maxmet/daily/2026-10-08/2026-10-08'],
        ['/metrics-service/metrics/maxmet/daily/2026-10-01/2026-10-08'],
        [
            `/metrics-service/metrics/racepredictions/latest/${encodeURIComponent(
                encodedName
            )}`
        ],
        [
            `/metrics-service/metrics/racepredictions/daily/${encodeURIComponent(
                encodedName
            )}`,
            { fromCalendarDate: '2026-10-01', toCalendarDate: '2026-10-08' }
        ]
    ];

    for (const domain of ['garmin.cn', 'garmin.com']) {
        const { gc, requests } = createClient(domain);
        gc.getUserProfile = async () =>
            assert.fail('Explicit name must skip profile lookup');
        for (const [index, [method, args]] of operations.entries()) {
            await gc[method](...args);
            assert.equal(
                requests[index].url,
                `https://connectapi.${domain}${routes[index][0]}`
            );
            assert.deepEqual(requests[index].config?.params, routes[index][1]);
        }
        await gc.getRacePredictionsRange('2026-10-01', '2026-10-08', {
            displayName: encodedName,
            aggregation: 'monthly'
        });
        assert.equal(
            requests[7].url,
            `https://connectapi.${domain}/metrics-service/metrics/racepredictions/monthly/${encodeURIComponent(
                encodedName
            )}`
        );
        assert.deepEqual(requests[7].config?.params, routes[6][1]);
        assert.equal(requests.length, 8);
    }
});

test('all metric methods preserve raw device maps, arrays, unknown fields, zeroes and nulls', async () => {
    const fixtures = [
        {
            calendarDate: '2026-10-08',
            trainingStatus: 0,
            devices: {
                'synthetic-device-1': { value: 0 },
                'synthetic-device-2': { value: null }
            },
            futureField: { samples: [0, null] }
        },
        [
            { calendarDate: '2026-10-08', value: 0, futureField: null },
            { calendarDate: '2026-10-09', value: null, futureField: {} }
        ],
        [],
        {}
    ];
    for (const [method, args] of operations) {
        for (const fixture of fixtures) {
            const { gc } = createClient('garmin.com', fixture);
            assert.strictEqual(await gc[method](...args), fixture, method);
        }
        for (const empty of [null, undefined, '']) {
            const { gc } = createClient();
            gc.client.get = async () => empty;
            assert.strictEqual(await gc[method](...args), null, method);
        }
    }
});

test('race predictions resolve the current profile on every call and preserve explicit names', async () => {
    const { gc, requests } = createClient();
    const profileNames = ['first account', 'second/账号', 'third%?# account'];
    let profileCalls = 0;
    gc.getUserProfile = async () => ({
        displayName: profileNames[profileCalls++]
    });
    await gc.getRacePredictions();
    await gc.getRacePredictions();
    await gc.getRacePredictionsRange('2026-10-01', '2026-10-08');
    assert.equal(profileCalls, 3);
    assert.ok(
        requests[0].url.endsWith(
            `/latest/${encodeURIComponent(profileNames[0])}`
        )
    );
    assert.ok(
        requests[1].url.endsWith(
            `/latest/${encodeURIComponent(profileNames[1])}`
        )
    );
    assert.ok(
        requests[2].url.endsWith(
            `/daily/${encodeURIComponent(profileNames[2])}`
        )
    );

    await gc.getRacePredictions({ displayName: encodedName });
    await gc.getRacePredictionsRange('2026-10-01', '2026-10-08', {
        displayName: encodedName,
        aggregation: 'monthly'
    });
    assert.equal(profileCalls, 3);
    assert.ok(
        requests[3].url.endsWith(`/latest/${encodeURIComponent(encodedName)}`)
    );
    assert.ok(
        requests[4].url.endsWith(`/monthly/${encodeURIComponent(encodedName)}`)
    );
});

test('race options and profile names are validated and profile failures retain their identity', async () => {
    const invalidOptions = [null, [], 'runner', 42, true, () => {}];
    const invalidNames = [null, 42, '', ' \t\n '];
    for (const method of ['getRacePredictions', 'getRacePredictionsRange']) {
        const call = (gc, options) =>
            method === 'getRacePredictions'
                ? gc[method](options)
                : gc[method]('2026-10-01', '2026-10-08', options);
        for (const options of [
            ...invalidOptions,
            ...invalidNames.map((displayName) => ({ displayName }))
        ]) {
            const { gc, requests } = createClient();
            let profileCalls = 0;
            gc.getUserProfile = async () => {
                profileCalls++;
                return { displayName: 'synthetic-profile' };
            };
            await assert.rejects(async () => call(gc, options));
            assert.equal(profileCalls, 0, method);
            assert.equal(requests.length, 0, method);
        }
        for (const profile of [
            null,
            undefined,
            {},
            ...invalidNames.map((displayName) => ({ displayName }))
        ]) {
            const { gc, requests } = createClient();
            let profileCalls = 0;
            gc.getUserProfile = async () => {
                profileCalls++;
                return profile;
            };
            await assert.rejects(async () => call(gc, {}));
            assert.equal(profileCalls, 1, method);
            assert.equal(requests.length, 0, method);
        }
        const profileError = new Error('Synthetic profile failure');
        const { gc, requests } = createClient();
        gc.getUserProfile = async () => {
            throw profileError;
        };
        await assert.rejects(
            async () => call(gc, {}),
            (error) => error === profileError
        );
        assert.equal(requests.length, 0, method);
    }
});

test('invalid dates, ranges and aggregations fail before profile lookup or HTTP requests', async () => {
    const invalidCalls = [
        ['getDailyTrainingStatus', ['2026-02-29']],
        ['getTrainingStatus', ['2026-10-8']],
        ['getTrainingLoadBalance', [new Date(NaN)]],
        ['getMaxMetrics', ['2026-10-08T00:00:00Z']],
        ['getMaxMetricsRange', ['2026-10-08', '2026-10-01']],
        ['getRacePredictionsRange', ['2026-02-29', '2026-10-08']],
        ['getRacePredictionsRange', ['2026-10-01', '2026-10-8']],
        ['getRacePredictionsRange', ['2026-10-08', '2026-10-01']],
        ['getRacePredictionsRange', ['2024-01-01', '2025-01-02']],
        ...['weekly', 'DAILY', '', null, 42].map((aggregation) => [
            'getRacePredictionsRange',
            ['2026-10-01', '2026-10-08', { aggregation }]
        ])
    ];
    for (const [method, args] of invalidCalls) {
        const { gc, requests } = createClient();
        let profileCalls = 0;
        gc.getUserProfile = async () => {
            profileCalls++;
            return { displayName: 'synthetic-profile' };
        };
        await assert.rejects(async () => gc[method](...args));
        assert.equal(profileCalls, 0, method);
        assert.equal(requests.length, 0, method);
    }

    const { gc, requests } = createClient();
    await gc.getMaxMetricsRange('2020-01-01', '2026-10-08');
    assert.equal(requests.length, 1);
    assert.ok(requests[0].url.endsWith('/2020-01-01/2026-10-08'));
});

test('race ranges permit a 366 day difference and count calendar days across DST', async (t) => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    t.after(() => {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    });
    const { gc, requests } = createClient();
    let profileCalls = 0;
    gc.getUserProfile = async () => {
        profileCalls++;
        return { displayName: 'synthetic-profile' };
    };
    await gc.getRacePredictionsRange('2024-01-01', '2025-01-01');
    // Local midnight timestamps differ by 366 days plus one hour in this range.
    await gc.getRacePredictionsRange('2023-11-05', '2024-11-05');
    assert.equal(profileCalls, 2);
    assert.equal(requests.length, 2);
    for (const args of [
        ['2024-01-01', '2025-01-02'],
        ['2023-11-05', '2024-11-06']
    ]) {
        await assert.rejects(async () => gc.getRacePredictionsRange(...args));
    }
    assert.equal(profileCalls, 2);
    assert.equal(requests.length, 2);
});

test('daily metric dates default to today and Date inputs use their local calendar dates', async (t) => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'Asia/Shanghai';
    t.after(() => {
        if (originalTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = originalTimezone;
    });
    const today = localDateString(new Date());
    const dailyMethods = [
        'getDailyTrainingStatus',
        'getTrainingStatus',
        'getTrainingLoadBalance',
        'getMaxMetrics'
    ];
    const { gc, requests } = createClient();
    for (const method of dailyMethods) {
        await gc[method]();
        const suffix =
            method === 'getMaxMetrics' ? `/${today}/${today}` : `/${today}`;
        assert.ok(requests.at(-1).url.endsWith(suffix), method);
    }
    const date = new Date('2026-10-07T16:30:00Z');
    assert.equal(localDateString(date), '2026-10-08');
    for (const method of dailyMethods) {
        await gc[method](date);
        const suffix =
            method === 'getMaxMetrics'
                ? '/2026-10-08/2026-10-08'
                : '/2026-10-08';
        assert.ok(requests.at(-1).url.endsWith(suffix), method);
    }
    await gc.getMaxMetricsRange(date, date);
    assert.ok(requests.at(-1).url.endsWith('/2026-10-08/2026-10-08'));
    await gc.getRacePredictionsRange(date, date, {
        displayName: 'synthetic-profile'
    });
    assert.deepEqual(requests.at(-1).config?.params, {
        fromCalendarDate: '2026-10-08',
        toCalendarDate: '2026-10-08'
    });
});

test('HTTP failures propagate unchanged from every training and race method', async () => {
    for (const [method, args] of operations) {
        const error = Object.assign(new Error('Synthetic HTTP failure'), {
            response: { status: 429, data: { message: 'synthetic error' } }
        });
        const { gc, requests } = createClient('garmin.com', error);
        await assert.rejects(
            async () => gc[method](...args),
            (actual) => actual === error
        );
        assert.equal(requests.length, 1, method);
    }
});
