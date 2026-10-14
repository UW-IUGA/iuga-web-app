/**
 * @behavior Expands a weekly schedule into ordinary dated event records, in date order.
 * @param startsOn Inclusive YYYY-MM-DD local date.
 * @param endsOn Inclusive YYYY-MM-DD local date.
 * @param schedule Weekday numbers (Sunday = 0) with HH:mm local start and optional same-day end times.
 * @param excludeDates YYYY-MM-DD local dates to skip.
 * @returns Event records with Date timestamps; an unspecified end time stays unspecified.
 */
export function createRecurringEvents({
    event,
    startsOn,
    endsOn,
    schedule,
    excludeDates = [],
    timeZone = "America/Los_Angeles",
}) {
    const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" });
    const localTime = (date, time) => {
        const wallTime = Date.parse(`${date}T${time}:00Z`);
        let instant = wallTime;
        // Recalculate at the resulting instant to account for a daylight-saving change.
        for (let pass = 0; pass < 2; pass++) {
            const offset = offsetFormatter.formatToParts(new Date(instant))
                .find((part) => part.type === "timeZoneName").value;
            const [, sign, hours = "0", minutes = "0"] = offset.match(/^GMT(?:([+-])(\d+)(?::(\d+))?)?$/);
            const offsetMinutes = (Number(hours) * 60 + Number(minutes)) * (sign === "-" ? -1 : 1);
            instant = wallTime - offsetMinutes * 60_000;
        }
        return new Date(instant);
    };
    const excluded = new Set(excludeDates);
    const events = [];
    // Walk calendar dates in UTC; only the session times are converted to the event's zone.
    for (const day = new Date(`${startsOn}T00:00:00Z`); day.toISOString().slice(0, 10) <= endsOn; day.setUTCDate(day.getUTCDate() + 1)) {
        const date = day.toISOString().slice(0, 10);
        if (excluded.has(date)) continue;
        for (const session of schedule.filter((session) => session.weekday === day.getUTCDay())) {
            events.push({
                ...event,
                eStartDate: localTime(date, session.startTime),
                ...(session.endTime ? { eEndDate: localTime(date, session.endTime) } : {}),
            });
        }
    }
    return events;
}
