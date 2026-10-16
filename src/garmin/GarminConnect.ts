import appRoot from 'app-root-path';
import { AxiosRequestConfig } from 'axios';

import FormData from 'form-data';
import _ from 'lodash';
import { DateTime } from 'luxon';
import * as fs from 'fs';
import * as path from 'path';
import { HttpClient } from '../common/HttpClient';
import { checkIsDirectory, createDirectory, writeToFile } from '../utils';
import { UrlClass } from './UrlClass';
import {
    ExportFileTypeValue,
    GCUserHash,
    GarminDomain,
    ICountActivities,
    IDailyStepsType,
    IGarminTokens,
    IOauth1Token,
    IOauth2Token,
    ISocialProfile,
    IUserSettings,
    IWorkout,
    IWorkoutDetail,
    UploadFileType,
    UploadFileTypeTypeValue
} from './types';
import Running from './workouts/Running';
import {
    calculateTimeDifference,
    GarminDate,
    getLocalTimestamp,
    toCalendarDate,
    toCalendarDateRange,
    toDateString
} from './common/DateUtils';
import { SleepData } from './types/sleep';
import { HeartRate } from './types/heartrate';
import { UpdateWeight, WeightData } from './types/weight';
import { HydrationData, WaterIntake } from './types/hydration';
import { GolfScorecard, GolfSummary } from './types/golf';
import { HrvData, HrvSummaries } from './types/hrv';
import {
    BodyBatteryData,
    StressData,
    StressSummary,
    TrainingReadinessData
} from './types/recovery';
import {
    DailyTrainingStatusData,
    MaxMetricsData,
    RacePredictionOptions,
    RacePredictionRangeOptions,
    RacePredictionsData,
    TrainingLoadBalanceData,
    TrainingStatusData
} from './types/training';
import { gramsToPounds } from './common/WeightUtils';
import { convertMLToOunces, convertOuncesToML } from './common/HydrationUtils';
import {
    ActivitySubType,
    ActivityType,
    GCActivityId,
    IActivity
} from './types/activity';

let config: GCCredentials | undefined = undefined;

try {
    config = appRoot.require('/garmin.config.json');
} catch (e) {
    // Do nothing
}

export type EventCallback<T> = (data: T) => void;

export interface GCCredentials {
    username: string;
    password: string;
}
export interface Listeners {
    [event: string]: EventCallback<any>[];
}

export enum Event {
    sessionChange = 'sessionChange'
}

export interface Session {}

export default class GarminConnect {
    client: HttpClient;
    private _userHash: GCUserHash | undefined;
    private credentials: GCCredentials;
    private listeners: Listeners;
    private url: UrlClass;
    // private oauth1: OAuth;
    constructor(
        credentials: GCCredentials | undefined = config,
        domain: GarminDomain = 'garmin.com'
    ) {
        if (!credentials) {
            throw new Error('Missing credentials');
        }
        this.credentials = credentials;
        this.url = new UrlClass(domain);
        this.client = new HttpClient(this.url);
        this._userHash = undefined;
        this.listeners = {};
    }

    async login(username?: string, password?: string): Promise<GarminConnect> {
        if (username && password) {
            this.credentials.username = username;
            this.credentials.password = password;
        }
        await this.client.login(
            this.credentials.username,
            this.credentials.password
        );
        return this;
    }
    exportTokenToFile(dirPath: string): void {
        const tokens = this.exportToken();
        const oauth1Data = JSON.stringify(tokens.oauth1);
        const oauth2Data = JSON.stringify(tokens.oauth2);
        if (!checkIsDirectory(dirPath)) {
            fs.mkdirSync(dirPath, { mode: 0o700 });
        }
        this.writeTokenFile(
            path.join(dirPath, 'oauth1_token.json'),
            oauth1Data
        );
        this.writeTokenFile(
            path.join(dirPath, 'oauth2_token.json'),
            oauth2Data
        );
    }
    loadTokenByFile(dirPath: string): void {
        if (!checkIsDirectory(dirPath)) {
            throw new Error('loadTokenByFile: Directory not found: ' + dirPath);
        }
        const oauth1Data = fs.readFileSync(
            path.join(dirPath, 'oauth1_token.json'),
            'utf8'
        );
        const oauth1 = JSON.parse(oauth1Data);
        const oauth2Data = fs.readFileSync(
            path.join(dirPath, 'oauth2_token.json'),
            'utf8'
        );
        const oauth2 = JSON.parse(oauth2Data);
        // Both reads, parses and validation must succeed before switching tokens.
        this.loadToken(oauth1, oauth2);
    }
    exportToken(): IGarminTokens {
        if (!this.client.oauth1Token || !this.client.oauth2Token) {
            throw new Error('exportToken: Token not found');
        }
        this.validateTokenPair(
            this.client.oauth1Token,
            this.client.oauth2Token
        );
        return {
            oauth1: this.client.oauth1Token,
            oauth2: this.client.oauth2Token
        };
    }
    // from db or localstorage etc
    loadToken(oauth1: IOauth1Token, oauth2: IOauth2Token): void {
        this.validateTokenPair(oauth1, oauth2);
        this.client.oauth1Token = oauth1;
        this.client.oauth2Token = oauth2;
    }

    private validateTokenPair(
        oauth1: IOauth1Token,
        oauth2: IOauth2Token
    ): void {
        if (
            !oauth1 ||
            typeof oauth1 !== 'object' ||
            Array.isArray(oauth1) ||
            typeof oauth1.oauth_token !== 'string' ||
            !oauth1.oauth_token.trim() ||
            typeof oauth1.oauth_token_secret !== 'string' ||
            !oauth1.oauth_token_secret.trim()
        ) {
            throw new Error('Invalid OAuth1 token');
        }
        if (
            !oauth2 ||
            typeof oauth2 !== 'object' ||
            Array.isArray(oauth2) ||
            typeof oauth2.access_token !== 'string' ||
            !oauth2.access_token.trim()
        ) {
            throw new Error('Invalid OAuth2 token');
        }
    }

    private writeTokenFile(filePath: string, data: string): void {
        const descriptor = fs.openSync(filePath, 'w', 0o600);
        try {
            // Existing token files may have broader permissions. Tighten them
            // before writing credentials without changing shared directories.
            fs.fchmodSync(descriptor, 0o600);
            fs.writeFileSync(descriptor, data, 'utf8');
        } finally {
            fs.closeSync(descriptor);
        }
    }

    async getUserSettings(): Promise<IUserSettings> {
        return this.client.get<IUserSettings>(this.url.USER_SETTINGS);
    }

    async getUserProfile(): Promise<ISocialProfile> {
        return this.client.get<ISocialProfile>(this.url.USER_PROFILE);
    }

    async getActivities(
        start?: number,
        limit?: number,
        activityType?: ActivityType,
        subActivityType?: ActivitySubType
    ): Promise<IActivity[]> {
        return this.client.get<IActivity[]>(this.url.ACTIVITIES, {
            params: { start, limit, activityType, subActivityType }
        });
    }

    async getActivity(activity: {
        activityId: GCActivityId;
    }): Promise<IActivity> {
        if (!activity.activityId) throw new Error('Missing activityId');
        return this.client.get<IActivity>(
            this.url.ACTIVITY + activity.activityId
        );
    }

    async countActivities(): Promise<ICountActivities> {
        return this.client.get<ICountActivities>(this.url.STAT_ACTIVITIES, {
            params: {
                aggregation: 'lifetime',
                startDate: '1970-01-01',
                endDate: DateTime.now().toFormat('yyyy-MM-dd'),
                metric: 'duration'
            }
        });
    }

    async downloadOriginalActivityData(
        activity: { activityId: GCActivityId },
        dir: string,
        type: ExportFileTypeValue = 'zip'
    ): Promise<void> {
        if (!activity.activityId) throw new Error('Missing activityId');
        if (!checkIsDirectory(dir)) {
            createDirectory(dir);
        }
        let fileBuffer: Buffer;
        if (type === 'tcx') {
            fileBuffer = await this.client.get(
                this.url.DOWNLOAD_TCX + activity.activityId
            );
        } else if (type === 'gpx') {
            fileBuffer = await this.client.get(
                this.url.DOWNLOAD_GPX + activity.activityId
            );
        } else if (type === 'kml') {
            fileBuffer = await this.client.get(
                this.url.DOWNLOAD_KML + activity.activityId
            );
        } else if (type === 'zip') {
            fileBuffer = await this.client.get<Buffer>(
                this.url.DOWNLOAD_ZIP + activity.activityId,
                {
                    responseType: 'arraybuffer'
                }
            );
        } else {
            throw new Error(
                'downloadOriginalActivityData - Invalid type: ' + type
            );
        }
        writeToFile(
            path.join(dir, `${activity.activityId}.${type}`),
            fileBuffer
        );
    }

    async uploadActivity(
        file: string,
        format: UploadFileTypeTypeValue = 'fit'
    ) {
        const detectedFormat = (format || path.extname(file))?.toLowerCase();
        if (!_.includes(UploadFileType, detectedFormat)) {
            throw new Error('uploadActivity - Invalid format: ' + format);
        }

        const fileBuffer = fs.createReadStream(file);
        const form = new FormData();
        form.append('userfile', fileBuffer);
        const response = await this.client.post(
            this.url.UPLOAD + '.' + format,
            form,
            {
                headers: {
                    'Content-Type': form.getHeaders()['content-type']
                }
            }
        );
        return response;
    }

    async deleteActivity(activity: {
        activityId: GCActivityId;
    }): Promise<void> {
        if (!activity.activityId) throw new Error('Missing activityId');
        await this.client.delete<void>(this.url.ACTIVITY + activity.activityId);
    }

    async getWorkouts(start: number, limit: number): Promise<IWorkout[]> {
        return this.client.get<IWorkout[]>(this.url.WORKOUTS, {
            params: {
                start,
                limit
            }
        });
    }
    async getWorkoutDetail(workout: {
        workoutId: string;
    }): Promise<IWorkoutDetail> {
        if (!workout.workoutId) throw new Error('Missing workoutId');
        return this.client.get<IWorkoutDetail>(
            this.url.WORKOUT(workout.workoutId)
        );
    }

    async addWorkout(
        workout: IWorkoutDetail | Running
    ): Promise<IWorkoutDetail> {
        if (!workout) throw new Error('Missing workout');

        if (workout instanceof Running) {
            if (workout.isValid()) {
                const data = { ...workout.toJson() };
                if (!data.description) {
                    data.description = 'Added by garmin-connect for Node.js';
                }
                return this.client.post<IWorkoutDetail>(
                    this.url.WORKOUT(),
                    data
                );
            }
        }

        const newWorkout = _.omit(workout, [
            'workoutId',
            'ownerId',
            'updatedDate',
            'createdDate',
            'author'
        ]);
        if (!newWorkout.description) {
            newWorkout.description = 'Added by garmin-connect for Node.js';
        }
        // console.log('addWorkout - newWorkout:', newWorkout)
        return this.client.post<IWorkoutDetail>(this.url.WORKOUT(), newWorkout);
    }

    async addRunningWorkout(
        name: string,
        meters: number,
        description: string
    ): Promise<IWorkoutDetail> {
        const running = new Running();
        running.name = name;
        running.distance = meters;
        running.description = description;
        return this.addWorkout(running);
    }

    async deleteWorkout(workout: { workoutId: string }) {
        if (!workout.workoutId) throw new Error('Missing workout');
        return this.client.delete(this.url.WORKOUT(workout.workoutId));
    }

    async getSteps(date = new Date()): Promise<number> {
        const dateString = toDateString(date);

        const days = await this.client.get<IDailyStepsType[]>(
            `${this.url.DAILY_STEPS}${dateString}/${dateString}`
        );
        const dayStats = days.find(
            ({ calendarDate }) => calendarDate === dateString
        );

        if (!dayStats) {
            throw new Error("Can't find daily steps for this date.");
        }

        return dayStats.totalSteps;
    }

    async getSleepData(date = new Date()): Promise<SleepData> {
        try {
            const dateString = toDateString(date);

            const sleepData = await this.client.get<SleepData>(
                `${this.url.DAILY_SLEEP}`,
                { params: { date: dateString } }
            );

            if (!sleepData) {
                throw new Error('Invalid or empty sleep data response.');
            }

            return sleepData;
        } catch (error: any) {
            throw new Error(`Error in getSleepData: ${error.message}`);
        }
    }

    async getSleepDuration(
        date = new Date()
    ): Promise<{ hours: number; minutes: number }> {
        try {
            const sleepData = await this.getSleepData(date);

            if (
                !sleepData ||
                !sleepData.dailySleepDTO ||
                sleepData.dailySleepDTO.sleepStartTimestampGMT === undefined ||
                sleepData.dailySleepDTO.sleepEndTimestampGMT === undefined
            ) {
                throw new Error(
                    'Invalid or missing sleep data for the specified date.'
                );
            }

            const sleepStartTimestampGMT =
                sleepData.dailySleepDTO.sleepStartTimestampGMT;
            const sleepEndTimestampGMT =
                sleepData.dailySleepDTO.sleepEndTimestampGMT;

            const { hours, minutes } = calculateTimeDifference(
                sleepStartTimestampGMT,
                sleepEndTimestampGMT
            );

            return {
                hours,
                minutes
            };
        } catch (error: any) {
            throw new Error(`Error in getSleepDuration: ${error.message}`);
        }
    }

    async getDailyWeightData(date = new Date()): Promise<WeightData> {
        try {
            const dateString = toDateString(date);
            const weightData = await this.client.get<WeightData>(
                `${this.url.DAILY_WEIGHT}/${dateString}`
            );

            if (!weightData) {
                throw new Error('Invalid or empty weight data response.');
            }

            return weightData;
        } catch (error: any) {
            throw new Error(`Error in getDailyWeightData: ${error.message}`);
        }
    }

    async getDailyWeightInPounds(date = new Date()): Promise<number> {
        const weightData = await this.getDailyWeightData(date);

        if (
            weightData.totalAverage &&
            typeof weightData.totalAverage.weight === 'number'
        ) {
            return gramsToPounds(weightData.totalAverage.weight);
        } else {
            throw new Error("Can't find valid daily weight for this date.");
        }
    }

    async getDailyHydration(date = new Date()): Promise<number> {
        try {
            const dateString = toDateString(date);
            const hydrationData = await this.client.get<HydrationData>(
                `${this.url.DAILY_HYDRATION}/${dateString}`
            );

            if (!hydrationData || !hydrationData.valueInML) {
                throw new Error('Invalid or empty hydration data response.');
            }

            return convertMLToOunces(hydrationData.valueInML);
        } catch (error: any) {
            throw new Error(`Error in getDailyHydration: ${error.message}`);
        }
    }

    async updateWeight(
        date = new Date(),
        lbs: number,
        timezone: string
    ): Promise<UpdateWeight> {
        try {
            const weightData = await this.client.post<UpdateWeight>(
                `${this.url.UPDATE_WEIGHT}`,
                {
                    dateTimestamp: getLocalTimestamp(date, timezone),
                    gmtTimestamp: date.toISOString().substring(0, 23),
                    unitKey: 'lbs',
                    value: lbs
                }
            );

            return weightData;
        } catch (error: any) {
            throw new Error(`Error in updateWeight: ${error.message}`);
        }
    }

    async updateHydrationLogOunces(
        date = new Date(),
        valueInOz: number
    ): Promise<WaterIntake> {
        try {
            const dateString = toDateString(date);
            const hydrationData = await this.client.put<WaterIntake>(
                `${this.url.HYDRATION_LOG}`,
                {
                    calendarDate: dateString,
                    valueInML: convertOuncesToML(valueInOz),
                    userProfileId: (await this.getUserProfile()).profileId,
                    timestampLocal: date.toISOString().substring(0, 23)
                }
            );

            return hydrationData;
        } catch (error: any) {
            throw new Error(
                `Error in updateHydrationLogOunces: ${error.message}`
            );
        }
    }

    async getGolfSummary(): Promise<GolfSummary> {
        try {
            const golfSummary = await this.client.get<GolfSummary>(
                `${this.url.GOLF_SCORECARD_SUMMARY}`
            );

            if (!golfSummary) {
                throw new Error('Invalid or empty golf summary data response.');
            }

            return golfSummary;
        } catch (error: any) {
            throw new Error(`Error in getGolfSummary: ${error.message}`);
        }
    }

    async getGolfScorecard(scorecardId: number): Promise<GolfScorecard> {
        try {
            const golfScorecard = await this.client.get<GolfScorecard>(
                `${this.url.GOLF_SCORECARD_DETAIL}`,
                { params: { 'scorecard-ids': scorecardId } }
            );

            if (!golfScorecard) {
                throw new Error(
                    'Invalid or empty golf scorecard data response.'
                );
            }

            return golfScorecard;
        } catch (error: any) {
            throw new Error(`Error in getGolfScorecard: ${error.message}`);
        }
    }

    async getHeartRate(date = new Date()): Promise<HeartRate> {
        try {
            const dateString = toDateString(date);
            const heartRate = await this.client.get<HeartRate>(
                `${this.url.DAILY_HEART_RATE}`,
                { params: { date: dateString } }
            );

            return heartRate;
        } catch (error: any) {
            throw new Error(`Error in getHeartRate: ${error.message}`);
        }
    }

    /** HRV summary, baseline and all overnight readings, without filtering. */
    async getHrvData(date: GarminDate = new Date()): Promise<HrvData | null> {
        return this.getOptionalData<HrvData>(
            `${this.url.HRV}/${toCalendarDate(date)}`
        );
    }

    /** Native inclusive date-range summaries; this does not fetch nightly readings. */
    async getHrvSummaries(
        startDate: GarminDate,
        endDate: GarminDate
    ): Promise<HrvSummaries | null> {
        const dates = toCalendarDateRange(startDate, endDate);
        return this.getOptionalData<HrvSummaries>(
            `${this.url.DAILY_HRV}/${dates.startDate}/${dates.endDate}`
        );
    }

    async getStressData(
        date: GarminDate = new Date()
    ): Promise<StressData | null> {
        return this.getOptionalData<StressData>(
            `${this.url.DAILY_STRESS}/${toCalendarDate(date)}`
        );
    }

    async getStressSummaries(
        startDate: GarminDate,
        endDate: GarminDate
    ): Promise<StressSummary[] | null> {
        const dates = toCalendarDateRange(startDate, endDate);
        return this.getOptionalData<StressSummary[]>(
            `${this.url.STRESS_SUMMARIES}/${dates.startDate}/${dates.endDate}`
        );
    }

    /** All daily reports, including their original Body Battery time series. */
    async getBodyBattery(
        startDate: GarminDate = new Date(),
        endDate: GarminDate = startDate
    ): Promise<BodyBatteryData[] | null> {
        const dates = toCalendarDateRange(startDate, endDate);
        return this.getOptionalData<BodyBatteryData[]>(this.url.BODY_BATTERY, {
            params: dates
        });
    }

    /** Keep every readiness snapshot and its recovery factors. */
    async getTrainingReadiness(
        date: GarminDate = new Date()
    ): Promise<TrainingReadinessData | null> {
        return this.getOptionalData<TrainingReadinessData>(
            `${this.url.TRAINING_READINESS}/${toCalendarDate(date)}`
        );
    }

    /** Daily status, including acute/chronic load and all returned devices. */
    async getDailyTrainingStatus(
        date: GarminDate = new Date()
    ): Promise<DailyTrainingStatusData | null> {
        return this.getOptionalData<DailyTrainingStatusData>(
            `${this.url.DAILY_TRAINING_STATUS}/${toCalendarDate(date)}`
        );
    }

    async getTrainingStatus(
        date: GarminDate = new Date()
    ): Promise<TrainingStatusData | null> {
        return this.getOptionalData<TrainingStatusData>(
            `${this.url.TRAINING_STATUS}/${toCalendarDate(date)}`
        );
    }

    /** Four-week balance ending on the selected calendar date. */
    async getTrainingLoadBalance(
        date: GarminDate = new Date()
    ): Promise<TrainingLoadBalanceData | null> {
        return this.getOptionalData<TrainingLoadBalanceData>(
            `${this.url.TRAINING_LOAD_BALANCE}/${toCalendarDate(date)}`
        );
    }

    /** Max metrics (including VO2 max); preserve the service's response envelope. */
    async getMaxMetrics(
        date: GarminDate = new Date()
    ): Promise<MaxMetricsData | null> {
        const calendarDate = toCalendarDate(date);
        return this.getOptionalData<MaxMetricsData>(
            `${this.url.MAX_METRICS}/${calendarDate}/${calendarDate}`
        );
    }

    async getMaxMetricsRange(
        startDate: GarminDate,
        endDate: GarminDate
    ): Promise<MaxMetricsData | null> {
        const dates = toCalendarDateRange(startDate, endDate);
        return this.getOptionalData<MaxMetricsData>(
            `${this.url.MAX_METRICS}/${dates.startDate}/${dates.endDate}`
        );
    }

    async getRacePredictions(
        options: RacePredictionOptions = {}
    ): Promise<RacePredictionsData | null> {
        this.validateRacePredictionOptions(options);
        const displayName = await this.resolveRaceDisplayName(
            options.displayName
        );
        return this.getOptionalData<RacePredictionsData>(
            `${this.url.RACE_PREDICTIONS}/latest/${encodeURIComponent(
                displayName
            )}`
        );
    }

    async getRacePredictionsRange(
        startDate: GarminDate,
        endDate: GarminDate,
        options: RacePredictionRangeOptions = {}
    ): Promise<RacePredictionsData | null> {
        this.validateRacePredictionOptions(options);
        const dates = toCalendarDateRange(startDate, endDate);
        const aggregation =
            options.aggregation === undefined ? 'daily' : options.aggregation;
        if (aggregation !== 'daily' && aggregation !== 'monthly') {
            throw new RangeError(
                'Race prediction aggregation must be daily or monthly.'
            );
        }
        // Match the Python client's 366-day span check, independently of local DST.
        const spanDays =
            (Date.parse(`${dates.endDate}T00:00:00.000Z`) -
                Date.parse(`${dates.startDate}T00:00:00.000Z`)) /
            86400000;
        if (spanDays > 366) {
            throw new RangeError(
                'Race prediction ranges must span no more than 366 days.'
            );
        }
        const displayName = await this.resolveRaceDisplayName(
            options.displayName
        );
        return this.getOptionalData<RacePredictionsData>(
            `${this.url.RACE_PREDICTIONS}/${aggregation}/${encodeURIComponent(
                displayName
            )}`,
            {
                params: {
                    fromCalendarDate: dates.startDate,
                    toCalendarDate: dates.endDate
                }
            }
        );
    }

    private validateRacePredictionOptions(
        options: RacePredictionOptions
    ): void {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new TypeError('Race prediction options must be an object.');
        }
        if (options.displayName !== undefined) {
            this.validateRaceDisplayName(options.displayName);
        }
    }

    private validateRaceDisplayName(displayName: unknown): string {
        if (typeof displayName !== 'string' || !displayName.trim()) {
            throw new RangeError(
                'Expected a non-empty Garmin profile displayName.'
            );
        }
        return displayName;
    }

    private async resolveRaceDisplayName(
        displayName?: GCUserHash
    ): Promise<string> {
        if (displayName !== undefined) {
            return displayName;
        }
        // Resolve the current profile each time; external session replacement can change accounts.
        const profile = await this.getUserProfile();
        return this.validateRaceDisplayName(profile?.displayName);
    }

    private async getOptionalData<T>(
        url: string,
        config?: AxiosRequestConfig
    ): Promise<T | null> {
        const data = await this.client.get<T | null | undefined | ''>(
            url,
            config
        );
        // Normalize successful empty responses only; let HTTP errors propagate intact.
        return data === null || data === undefined || data === '' ? null : data;
    }

    async get<T>(url: string, data?: any) {
        const response = await this.client.get(url, data);
        return response as T;
    }

    async post<T>(url: string, data: any) {
        const response = await this.client.post<T>(url, data, {});
        return response as T;
    }

    async put<T>(url: string, data: any) {
        const response = await this.client.put<T>(url, data, {});
        return response as T;
    }
}
