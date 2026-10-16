export { default as GarminConnect } from './garmin/GarminConnect';
export type { HeartRate } from './garmin/types/heartrate';
export type { UpdateWeight, WeightData } from './garmin/types/weight';
export type { HydrationData, WaterIntake } from './garmin/types/hydration';
export type { GolfScorecard, GolfSummary } from './garmin/types/golf';
export type { GarminDate } from './garmin/common/DateUtils';
export type {
    HrvBaseline,
    HrvData,
    HrvReading,
    HrvSummaries,
    HrvSummary
} from './garmin/types/hrv';
export type {
    BodyBatteryData,
    StressData,
    StressSummary,
    StressSummaryValues,
    TrainingReadiness,
    TrainingReadinessData,
    WellnessValueDescriptor,
    WellnessValueRow
} from './garmin/types/recovery';
export type {
    AcuteTrainingLoad,
    DailyTrainingStatus,
    DailyTrainingStatusData,
    MaxMetricsData,
    RacePredictionAggregation,
    RacePredictionOptions,
    RacePredictionRangeOptions,
    RacePredictionsData,
    RecordedTrainingDevice,
    TrainingLoadBalance,
    TrainingLoadBalanceData,
    TrainingLoadBalanceDevice,
    TrainingMetricsData,
    TrainingStatusData,
    TrainingStatusDevice
} from './garmin/types/training';
