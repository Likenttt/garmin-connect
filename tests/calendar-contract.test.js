const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { GarminConnect } = require('../dist');
const {
    toCalendarDate,
    toCalendarDateRange
} = require('../dist/garmin/common/DateUtils');

function createClient() {
    const gc = new GarminConnect({
        username: 'synthetic@example.com',
        password: 'synthetic'
    });
    const requests = [];
    let profileCalls = 0;
    gc.client.get = async (url, config) => {
        requests.push({ url, config });
        return [];
    };
    gc.getUserProfile = async () => {
        profileCalls++;
        return { displayName: 'synthetic-profile' };
    };
    return { gc, requests, getProfileCalls: () => profileCalls };
}

// Child processes isolate TZ changes from other tests and the developer's clock.
function datesInTimezone(timezone, values, useDateObjects = false) {
    const modulePath = require.resolve('../dist/garmin/common/DateUtils');
    const script = `
        const { toCalendarDate } = require(${JSON.stringify(modulePath)});
        const dates = ${JSON.stringify(values)};
        process.stdout.write(JSON.stringify(dates.map(value =>
            toCalendarDate(${useDateObjects ? 'new Date(value)' : 'value'})
        )));
    `;
    const child = spawnSync(process.execPath, ['-e', script], {
        env: { ...process.env, TZ: timezone },
        encoding: 'utf8'
    });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
}

test('Gregorian century rules distinguish divisible-by-100 and divisible-by-400 years', () => {
    for (const year of ['1900', '2100']) {
        assert.equal(toCalendarDate(`${year}-02-28`), `${year}-02-28`);
        assert.throws(() => toCalendarDate(`${year}-02-29`), RangeError);
    }
    for (const year of ['2000', '2400']) {
        assert.equal(toCalendarDate(`${year}-02-29`), `${year}-02-29`);
        assert.throws(() => toCalendarDate(`${year}-02-30`), RangeError);
    }
});

test('every month accepts its final day and rejects the following day without rollover', () => {
    const monthEnds = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (const [index, day] of monthEnds.entries()) {
        const month = String(index + 1).padStart(2, '0');
        const lastDate = `2026-${month}-${day}`;
        assert.equal(toCalendarDate(lastDate), lastDate);
        assert.throws(
            () => toCalendarDate(`2026-${month}-${day + 1}`),
            RangeError
        );
        assert.throws(() => toCalendarDate(`2026-${month}-00`), RangeError);
    }
});

test('supported years retain leading zeroes and reject year zero or expanded years', () => {
    for (const date of ['0001-01-01', '0099-12-31', '9999-12-31']) {
        assert.equal(toCalendarDate(date), date);
    }
    for (const date of [
        '0000-01-01',
        '0000-02-29',
        '10000-01-01',
        '-0001-01-01'
    ]) {
        assert.throws(() => toCalendarDate(date), RangeError);
    }
    assert.throws(
        () => toCalendarDate(new Date('0000-01-01T12:00:00Z')),
        RangeError
    );
    assert.throws(
        () => toCalendarDate(new Date('+010000-01-01T12:00:00Z')),
        RangeError
    );
});

test('runtime input validation rejects primitives and date-like objects instead of coercing', () => {
    const invalid = [
        undefined,
        null,
        0,
        20261008,
        true,
        1n,
        Symbol('calendar-date'),
        [],
        ['2026-10-08'],
        new String('2026-10-08'),
        { toString: () => '2026-10-08', getTime: () => 0 },
        new Date(NaN)
    ];
    for (const value of invalid) {
        assert.throws(() => toCalendarDate(value), RangeError);
    }
});

test('date-only values remain unchanged in UTC, Shanghai, Los Angeles and Auckland', () => {
    const dates = [
        '0001-01-01',
        '0099-12-31',
        '2000-02-29',
        '2026-10-08',
        '9999-12-31'
    ];
    for (const timezone of [
        'UTC',
        'Asia/Shanghai',
        'America/Los_Angeles',
        'Pacific/Auckland'
    ]) {
        assert.deepEqual(datesInTimezone(timezone, dates), dates, timezone);
    }
});

test('Date objects resolve to the local day across UTC midnight and both DST transitions', () => {
    const cases = [
        [
            'UTC',
            ['2026-10-07T23:59:59.999Z', '2026-10-08T00:00:00Z'],
            ['2026-10-07', '2026-10-08']
        ],
        [
            'Asia/Shanghai',
            ['2026-10-07T15:59:59.999Z', '2026-10-07T16:00:00Z'],
            ['2026-10-07', '2026-10-08']
        ],
        [
            'America/Los_Angeles',
            [
                '2026-10-08T00:00:00Z',
                '2026-10-08T06:59:59.999Z',
                '2026-10-08T07:00:00Z'
            ],
            ['2026-10-07', '2026-10-07', '2026-10-08']
        ],
        [
            'America/Los_Angeles',
            [
                '2026-03-08T09:59:59Z',
                '2026-03-08T10:00:00Z',
                '2026-11-01T08:59:59Z',
                '2026-11-01T09:00:00Z'
            ],
            ['2026-03-08', '2026-03-08', '2026-11-01', '2026-11-01']
        ],
        [
            'Pacific/Auckland',
            [
                '2026-04-04T13:59:59Z',
                '2026-04-04T14:00:00Z',
                '2026-09-26T13:59:59Z',
                '2026-09-26T14:00:00Z'
            ],
            ['2026-04-05', '2026-04-05', '2026-09-27', '2026-09-27']
        ]
    ];
    for (const [timezone, instants, expected] of cases) {
        assert.deepEqual(
            datesInTimezone(timezone, instants, true),
            expected,
            timezone
        );
    }
});

test('calendar ranges permit same-day and cross-year endpoints without changing inputs', () => {
    const cases = [
        ['0001-01-01', '0001-01-01'],
        ['0099-12-31', '0100-01-01'],
        ['2026-12-31', '2027-01-01'],
        ['9999-12-31', '9999-12-31']
    ];
    for (const [startDate, endDate] of cases) {
        assert.deepEqual(toCalendarDateRange(startDate, endDate), {
            startDate,
            endDate
        });
        if (startDate !== endDate) {
            assert.throws(
                () => toCalendarDateRange(endDate, startDate),
                RangeError
            );
        }
    }
    const start = new Date('2026-10-07T00:00:00Z');
    const end = new Date('2026-10-08T00:00:00Z');
    const timestamps = [start.getTime(), end.getTime()];
    toCalendarDateRange(start, end);
    assert.deepEqual([start.getTime(), end.getTime()], timestamps);
});

test('required range endpoints reject omitted or undefined dates before HTTP or profile access', async () => {
    const methods = [
        'getHrvSummaries',
        'getStressSummaries',
        'getMaxMetricsRange',
        'getRacePredictionsRange'
    ];
    for (const method of methods) {
        const { gc, requests, getProfileCalls } = createClient();
        for (const args of [
            [],
            ['2026-10-08'],
            ['2026-10-08', undefined],
            [undefined, '2026-10-08']
        ]) {
            await assert.rejects(() => gc[method](...args), RangeError);
        }
        assert.equal(requests.length, 0, method);
        assert.equal(getProfileCalls(), 0, method);
    }
});

test('monthly race history enforces the 366-day calendar boundary even in early years', async () => {
    const { gc, requests, getProfileCalls } = createClient();
    const options = Object.freeze({
        aggregation: 'monthly',
        displayName: 'synthetic-profile'
    });
    for (const dates of [
        ['2000-01-01', '2001-01-01'],
        ['1900-01-01', '1901-01-02'],
        ['0099-01-01', '0100-01-02'],
        ['2026-12-31', '2026-12-31']
    ]) {
        await gc.getRacePredictionsRange(...dates, options);
        assert.deepEqual(requests.at(-1).config.params, {
            fromCalendarDate: dates[0],
            toCalendarDate: dates[1]
        });
        assert.ok(requests.at(-1).url.includes('/monthly/'));
    }
    for (const dates of [
        ['2000-01-01', '2001-01-02'],
        ['1900-01-01', '1901-01-03'],
        ['0099-01-01', '0100-01-03']
    ]) {
        await assert.rejects(
            () => gc.getRacePredictionsRange(...dates, options),
            RangeError
        );
    }
    assert.equal(requests.length, 4);
    assert.equal(getProfileCalls(), 0);
    assert.deepEqual(options, {
        aggregation: 'monthly',
        displayName: 'synthetic-profile'
    });
});

test('unknown aggregation objects and symbols reject before account discovery or requests', async () => {
    const { gc, requests, getProfileCalls } = createClient();
    for (const aggregation of [true, {}, [], Symbol('daily')]) {
        const options = Object.freeze({ aggregation });
        await assert.rejects(
            () =>
                gc.getRacePredictionsRange('2026-10-01', '2026-10-08', options),
            RangeError
        );
        assert.strictEqual(options.aggregation, aggregation);
    }
    assert.equal(requests.length, 0);
    assert.equal(getProfileCalls(), 0);
});
