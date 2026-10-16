/** HRV fields are optional because devices and recording history differ. */
export interface HrvBaseline {
    lowUpper?: number | null;
    balancedLow?: number | null;
    balancedUpper?: number | null;
    markerValue?: number | null;
    [key: string]: unknown;
}

export interface HrvSummary {
    calendarDate?: string | null;
    weeklyAvg?: number | null;
    lastNightAvg?: number | null;
    lastNight5MinHigh?: number | null;
    baseline?: HrvBaseline | null;
    status?: string | null;
    feedbackPhrase?: string | null;
    createTimeStamp?: string | null;
    [key: string]: unknown;
}

export interface HrvReading {
    hrvValue?: number | null;
    readingTimeGMT?: string | null;
    readingTimeLocal?: string | null;
    [key: string]: unknown;
}

export interface HrvData {
    userProfilePk?: number | null;
    hrvSummary?: HrvSummary | null;
    hrvReadings?: HrvReading[] | null;
    startTimestampGMT?: string | null;
    endTimestampGMT?: string | null;
    startTimestampLocal?: string | null;
    endTimestampLocal?: string | null;
    sleepStartTimestampGMT?: string | null;
    sleepEndTimestampGMT?: string | null;
    sleepStartTimestampLocal?: string | null;
    sleepEndTimestampLocal?: string | null;
    [key: string]: unknown;
}

/** Raw response envelope from the native HRV date-range endpoint. */
export interface HrvSummaries {
    userProfilePk?: number | null;
    hrvSummaries?: HrvSummary[] | null;
    [key: string]: unknown;
}
