/** Open response shapes where a complete endpoint schema is not yet verified. */
export type TrainingMetricsData =
    | Record<string, unknown>
    | Record<string, unknown>[];
export type TrainingStatusData = TrainingMetricsData;
export type MaxMetricsData = TrainingMetricsData;
export type RacePredictionsData = TrainingMetricsData;

export interface RecordedTrainingDevice {
    deviceId?: number | null;
    imageURL?: string | null;
    deviceName?: string | null;
    category?: number | null;
    [key: string]: unknown;
}

export interface AcuteTrainingLoad {
    acwrPercent?: number | null;
    acwrStatus?: string | null;
    acwrStatusFeedback?: string | null;
    dailyTrainingLoadAcute?: number | null;
    maxTrainingLoadChronic?: number | null;
    minTrainingLoadChronic?: number | null;
    dailyTrainingLoadChronic?: number | null;
    dailyAcuteChronicWorkloadRatio?: number | null;
    [key: string]: unknown;
}

export interface TrainingStatusDevice {
    calendarDate?: string | null;
    sinceDate?: string | null;
    /** Only null was observed; the non-null representation is not yet verified. */
    weeklyTrainingLoad?: unknown;
    trainingStatus?: number | null;
    timestamp?: number | null;
    deviceId?: number | null;
    loadTunnelMin?: unknown;
    loadTunnelMax?: unknown;
    loadLevelTrend?: unknown;
    sport?: string | null;
    subSport?: string | null;
    fitnessTrendSport?: string | null;
    fitnessTrend?: number | null;
    trainingStatusFeedbackPhrase?: string | null;
    trainingPaused?: boolean | null;
    acuteTrainingLoadDTO?: AcuteTrainingLoad | null;
    primaryTrainingDevice?: boolean | null;
    [key: string]: unknown;
}

/** Fields observed in a recording's payload labelled with the daily endpoint. */
export interface DailyTrainingStatus {
    userId?: number | null;
    latestTrainingStatusData?: Record<string, TrainingStatusDevice> | null;
    recordedDevices?: RecordedTrainingDevice[] | null;
    showSelector?: boolean | null;
    lastPrimarySyncDate?: unknown;
    [key: string]: unknown;
}

export type DailyTrainingStatusData =
    | DailyTrainingStatus
    | DailyTrainingStatus[];

export interface TrainingLoadBalanceDevice {
    calendarDate?: string | null;
    deviceId?: number | null;
    monthlyLoadAerobicLow?: number | null;
    monthlyLoadAerobicHigh?: number | null;
    monthlyLoadAnaerobic?: number | null;
    monthlyLoadAerobicLowTargetMin?: number | null;
    monthlyLoadAerobicLowTargetMax?: number | null;
    monthlyLoadAerobicHighTargetMin?: number | null;
    monthlyLoadAerobicHighTargetMax?: number | null;
    monthlyLoadAnaerobicTargetMin?: number | null;
    monthlyLoadAnaerobicTargetMax?: number | null;
    trainingBalanceFeedbackPhrase?: string | null;
    primaryTrainingDevice?: boolean | null;
    [key: string]: unknown;
}

/** Four-week load balance for every returned device, without selecting one. */
export interface TrainingLoadBalance {
    userId?: number | null;
    metricsTrainingLoadBalanceDTOMap?: Record<
        string,
        TrainingLoadBalanceDevice
    > | null;
    recordedDevices?: RecordedTrainingDevice[] | null;
    [key: string]: unknown;
}

export type TrainingLoadBalanceData =
    | TrainingLoadBalance
    | TrainingLoadBalance[];

export type RacePredictionAggregation = 'daily' | 'monthly';

export interface RacePredictionOptions {
    /** Internal socialProfile.displayName, not an email address or account alias. */
    displayName?: string;
}

export interface RacePredictionRangeOptions extends RacePredictionOptions {
    aggregation?: RacePredictionAggregation;
}
