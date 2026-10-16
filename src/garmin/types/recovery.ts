/** Raw rows retain Garmin's descriptor-dependent columns and sentinel values. */
export type WellnessValueRow = (number | string | null)[];

export interface WellnessValueDescriptor {
    key?: string;
    index?: number;
    [key: string]: unknown;
}

export interface StressData {
    userProfilePK?: number | null;
    calendarDate?: string | null;
    startTimestampGMT?: string | null;
    endTimestampGMT?: string | null;
    startTimestampLocal?: string | null;
    endTimestampLocal?: string | null;
    maxStressLevel?: number | null;
    avgStressLevel?: number | null;
    stressChartValueOffset?: number | null;
    stressChartYAxisOrigin?: number | null;
    stressValueDescriptorsDTOList?: WellnessValueDescriptor[] | null;
    stressValuesArray?: WellnessValueRow[] | null;
    bodyBatteryValueDescriptorsDTOList?: WellnessValueDescriptor[] | null;
    bodyBatteryValuesArray?: WellnessValueRow[] | null;
    [key: string]: unknown;
}

export interface StressSummaryValues {
    overallStressLevel?: number | null;
    restStressDuration?: number | null;
    lowStressDuration?: number | null;
    mediumStressDuration?: number | null;
    highStressDuration?: number | null;
    [key: string]: unknown;
}

export interface StressSummary {
    calendarDate?: string | null;
    values?: StressSummaryValues | null;
    [key: string]: unknown;
}

export interface BodyBatteryData {
    date?: string | null;
    charged?: number | null;
    drained?: number | null;
    startTimestampGMT?: string | null;
    endTimestampGMT?: string | null;
    startTimestampLocal?: string | null;
    endTimestampLocal?: string | null;
    bodyBatteryValueDescriptorDTOList?: WellnessValueDescriptor[] | null;
    bodyBatteryValuesArray?: WellnessValueRow[] | null;
    [key: string]: unknown;
}

/** A readiness snapshot; the API can return several snapshots for one day. */
export interface TrainingReadiness {
    userProfilePK?: number | null;
    calendarDate?: string | null;
    timestamp?: string | null;
    timestampLocal?: string | null;
    deviceId?: number | null;
    score?: number | null;
    level?: string | null;
    feedbackLong?: string | null;
    feedbackShort?: string | null;
    sleepScore?: number | null;
    sleepScoreFactorPercent?: number | null;
    sleepScoreFactorFeedback?: string | null;
    sleepScoreFactorFeedbackPhrase?: string | null;
    /** Recovery time is reported in minutes. */
    recoveryTime?: number | null;
    recoveryTimeFactorPercent?: number | null;
    recoveryTimeFactorFeedback?: string | null;
    recoveryTimeFactorFeedbackPhrase?: string | null;
    recoveryTimeChangePhrase?: string | null;
    acuteLoad?: number | null;
    acwrFactorPercent?: number | null;
    acwrFactorFeedback?: string | null;
    acwrFactorFeedbackPhrase?: string | null;
    hrvWeeklyAverage?: number | null;
    hrvFactorPercent?: number | null;
    hrvFactorFeedback?: string | null;
    hrvFactorFeedbackPhrase?: string | null;
    stressHistoryFactorPercent?: number | null;
    stressHistoryFactorFeedback?: string | null;
    stressHistoryFactorFeedbackPhrase?: string | null;
    sleepHistoryFactorPercent?: number | null;
    sleepHistoryFactorFeedback?: string | null;
    sleepHistoryFactorFeedbackPhrase?: string | null;
    validSleep?: boolean | null;
    primaryActivityTracker?: boolean | null;
    inputContext?: string | null;
    [key: string]: unknown;
}

/** Preserve both observed readiness response shapes without dropping snapshots. */
export type TrainingReadinessData = TrainingReadiness[] | TrainingReadiness;
