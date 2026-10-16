export function toDateString(date: Date) {
    const offset = date.getTimezoneOffset();
    const offsetDate = new Date(date.getTime() - offset * 60 * 1000);
    const [dateString] = offsetDate.toISOString().split('T');
    return dateString;
}

export type GarminDate = Date | string;

/** Resolve a local calendar date without interpreting date-only strings as UTC. */
export function toCalendarDate(date: GarminDate): string {
    const value =
        typeof date === 'string'
            ? date
            : date instanceof Date && !isNaN(date.getTime())
            ? toDateString(date)
            : '';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new RangeError(
            'Expected a valid calendar date in YYYY-MM-DD format.'
        );
    }

    const [year, month, day] = value.split('-').map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    if (
        year < 1 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth[month - 1]
    ) {
        throw new RangeError(
            'Expected a valid calendar date in YYYY-MM-DD format.'
        );
    }

    return value;
}

export function toCalendarDateRange(
    startDate: GarminDate,
    endDate: GarminDate
): { startDate: string; endDate: string } {
    const start = toCalendarDate(startDate);
    const end = toCalendarDate(endDate);
    if (start > end) {
        throw new RangeError('startDate must be on or before endDate.');
    }
    return { startDate: start, endDate: end };
}

export function calculateTimeDifference(
    sleepStartTimestampGMT: number,
    sleepEndTimestampGMT: number
): { hours: number; minutes: number } {
    // Calculate time difference in seconds
    const timeDifferenceInSeconds =
        (sleepEndTimestampGMT - sleepStartTimestampGMT) / 1000;

    // Convert time difference to hours and minutes
    const hours = Math.floor(timeDifferenceInSeconds / 3600);
    const minutes = Math.floor((timeDifferenceInSeconds % 3600) / 60);

    return {
        hours,
        minutes
    };
}

export function getLocalTimestamp(date: Date, timezone: string) {
    // Get the current local date timestamp in ISO format
    const localTimestampISO = date.toISOString().substring(0, 23);

    // Convert the ISO timestamp to local timezone while maintaining the same format
    const localTimestamp = new Date(localTimestampISO).toLocaleString('en-US', {
        timeZone: timezone,
        hour12: false
    });

    // Format the local timestamp as `YYYY-MM-DDTHH:MM:SS.SSS`
    const formattedLocalTimestamp = new Date(localTimestamp)
        .toISOString()
        .substring(0, 23);
    return formattedLocalTimestamp;
}
