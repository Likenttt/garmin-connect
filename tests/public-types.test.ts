import {
    GarminConnect,
    GarminDate,
    HrvData,
    HrvSummaries,
    StressData,
    StressSummary,
    BodyBatteryData,
    TrainingReadinessData,
    DailyTrainingStatusData,
    TrainingStatusData,
    TrainingLoadBalanceData,
    MaxMetricsData,
    RacePredictionsData,
    RacePredictionRangeOptions
} from '../dist';

// Compile-only consumer contracts for the package's public declaration entry.
declare const gc: GarminConnect;
declare const date: GarminDate;

const hrv: Promise<HrvData | null> = gc.getHrvData(date);
const hrvHistory: Promise<HrvSummaries | null> = gc.getHrvSummaries(date, date);
const stress: Promise<StressData | null> = gc.getStressData(date);
const stressHistory: Promise<StressSummary[] | null> = gc.getStressSummaries(
    date,
    date
);
const battery: Promise<BodyBatteryData[] | null> = gc.getBodyBattery(date);
const readiness: Promise<TrainingReadinessData | null> =
    gc.getTrainingReadiness(date);
const dailyStatus: Promise<DailyTrainingStatusData | null> =
    gc.getDailyTrainingStatus(date);
const status: Promise<TrainingStatusData | null> = gc.getTrainingStatus(date);
const load: Promise<TrainingLoadBalanceData | null> =
    gc.getTrainingLoadBalance(date);
const max: Promise<MaxMetricsData | null> = gc.getMaxMetrics(date);
const maxHistory: Promise<MaxMetricsData | null> = gc.getMaxMetricsRange(
    date,
    date
);
const prediction: Promise<RacePredictionsData | null> = gc.getRacePredictions();
const predictionHistory: Promise<RacePredictionsData | null> =
    gc.getRacePredictionsRange(date, date, { aggregation: 'monthly' });

// Empty/missing devices, null measurements, sentinels and new raw fields are valid.
const hrvPayload: HrvData = {
    hrvSummary: {
        baseline: null,
        weeklyAvg: 0,
        lastNightAvg: null,
        futureField: {}
    },
    hrvReadings: [{ hrvValue: null }, {}],
    futureEnvelope: ['unverified', null]
};
const stressPayload: StressData = {
    stressValuesArray: [[0, -1, null, 'raw']],
    avgStressLevel: null
};
const readinessPayload: TrainingReadinessData = [
    { score: null, recoveryTime: 0, inputContext: null },
    {}
];
const dailyPayload: DailyTrainingStatusData = {
    latestTrainingStatusData: {
        'synthetic-device': {
            acuteTrainingLoadDTO: { dailyTrainingLoadAcute: null },
            weeklyTrainingLoad: { unverified: true }
        }
    },
    recordedDevices: null
};
const loadPayload: TrainingLoadBalanceData = {
    metricsTrainingLoadBalanceDTOMap: {
        'synthetic-device': {
            monthlyLoadAnaerobic: 0,
            primaryTrainingDevice: null
        }
    }
};
const rawPayload: MaxMetricsData = [{ unverifiedVo2Field: { value: null } }];
const rawRacePayload: RacePredictionsData = { unknownNewMetric: [null, 0] };

async function consumerMustHandleMissingData(): Promise<void> {
    const result = await hrv;
    const average: number | null | undefined = result?.hrvSummary?.weeklyAvg;
    const futureData: unknown = result?.futureEnvelope;
    // @ts-expect-error Nullable and optional HRV measurements need an explicit guard.
    const unguardedAverage: number = result?.hrvSummary?.weeklyAvg;
    // @ts-expect-error New raw fields remain unknown until the consumer validates them.
    const assumedFutureNumber: number = result?.futureEnvelope;
    // @ts-expect-error API responses can be absent, even for valid account dates.
    const nonNullablePromise: Promise<HrvData> = gc.getHrvData(date);
    void [
        average,
        futureData,
        unguardedAverage,
        assumedFutureNumber,
        nonNullablePromise
    ];
}

// @ts-expect-error Epoch numbers are not calendar dates; callers must choose timezone explicitly.
const numericDate: GarminDate = 1791417600000;
// @ts-expect-error Reject unsupported aggregations in public caller options.
const weeklyOptions: RacePredictionRangeOptions = { aggregation: 'weekly' };
// @ts-expect-error A calendar range requires both endpoints.
gc.getHrvSummaries('2026-10-08');
// @ts-expect-error Race history also requires a final date.
gc.getRacePredictionsRange('2026-10-08');
// @ts-expect-error Profile displayName is a string, never a numeric account ID.
gc.getRacePredictions({ displayName: 42 });
// @ts-expect-error The typed summary rejects malformed known metric values.
const malformedHrv: HrvData = { hrvSummary: { weeklyAvg: '48' } };
const malformedLoad: DailyTrainingStatusData = {
    latestTrainingStatusData: {
        // @ts-expect-error Known nested training load measurements reject string values.
        device: { acuteTrainingLoadDTO: { dailyTrainingLoadAcute: '42' } }
    }
};

void [
    hrvHistory,
    stress,
    stressHistory,
    battery,
    readiness,
    dailyStatus,
    status,
    load,
    max,
    maxHistory,
    prediction,
    predictionHistory,
    hrvPayload,
    stressPayload,
    readinessPayload,
    dailyPayload,
    loadPayload,
    rawPayload,
    rawRacePayload,
    consumerMustHandleMissingData,
    numericDate,
    weeklyOptions,
    malformedHrv,
    malformedLoad
];
