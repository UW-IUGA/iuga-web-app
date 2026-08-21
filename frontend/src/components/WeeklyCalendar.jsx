import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faCalendarDay, faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { addWeeks, format, isToday, isValid, subWeeks } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import Tag from "./Tag";
import { categoriesFor } from "../utils/eventStreams";
import { eventsForDay, formatWeekLabel, getWeekDays, getWeekStart } from "../utils/weeklyCalendar";

const FALLBACK_CATEGORY = "Academic";

const categoryForEvent = (event) => categoriesFor(event)[0] ?? FALLBACK_CATEGORY;

const eventTime = (event) => format(new Date(event.eStartDate), "h:mm a");

const safeDate = (value) => {
    const date = value ? new Date(value) : new Date();
    return isValid(date) ? date : new Date();
};

const WeeklyCalendar = ({ events = [], initialDate, onSelectEvent }) => {
    const [weekAnchor, setWeekAnchor] = useState(() => safeDate(initialDate));
    const weekStart = useMemo(() => getWeekStart(weekAnchor), [weekAnchor]);
    const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
    const weekLabel = formatWeekLabel(weekStart);
    const previousWeekLabel = formatWeekLabel(subWeeks(weekStart, 1));
    const nextWeekLabel = formatWeekLabel(addWeeks(weekStart, 1));

    useEffect(() => {
        if (initialDate) setWeekAnchor(safeDate(initialDate));
    }, [initialDate]);

    return (
        <section className="weeklyCalendar" aria-labelledby="weekly-calendar-heading">
            <div className="weeklyCalendarHeader">
                <div className="weeklyCalendarHeading">
                    <span className="eventsEyebrow">THIS WEEK, AT A GLANCE</span>
                    <h2 id="weekly-calendar-heading">Find your next event.</h2>
                    <p>Tap an event for the details, then save your seat.</p>
                </div>
                <div className="weeklyCalendarControls" aria-label="Week navigation">
                    <button
                        className="weeklyCalendarNav"
                        type="button"
                        aria-label={`Previous week: ${previousWeekLabel}`}
                        onClick={() => setWeekAnchor(subWeeks(weekStart, 1))}
                    >
                        <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
                    </button>
                    <div className="weeklyCalendarRange" role="status" aria-live="polite">
                        <span>WEEK OF</span>
                        <strong>{weekLabel}</strong>
                    </div>
                    <button
                        className="weeklyCalendarNav"
                        type="button"
                        aria-label={`Next week: ${nextWeekLabel}`}
                        onClick={() => setWeekAnchor(addWeeks(weekStart, 1))}
                    >
                        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="weeklyCalendarLegend" aria-label="Event categories">
                {["Academic", "Social", "Professional"].map((category) => (
                    <Tag key={category} text={category} type={category} />
                ))}
            </div>

            <div className="weeklyCalendarGrid" role="grid" aria-label="Weekly events calendar">
                <div className="weeklyCalendarWeekdays" role="row">
                    {weekDays.map((day) => (
                        <div className="weeklyCalendarWeekday" role="columnheader" key={day.toISOString()}>
                            <span>{format(day, "EEE")}</span>
                            <strong>{format(day, "d")}</strong>
                        </div>
                    ))}
                </div>
                <div className="weeklyCalendarDays" role="row">
                    {weekDays.map((day) => {
                        const dayEvents = eventsForDay(events, day);
                        const dayLabel = format(day, "EEEE, MMMM d");

                        return (
                            <div
                                className={`weeklyCalendarDay${isToday(day) ? " isToday" : ""}`}
                                role="gridcell"
                                aria-label={`${dayLabel}: ${dayEvents.length} ${dayEvents.length === 1 ? "event" : "events"}`}
                                key={day.toISOString()}
                            >
                                <div className="weeklyCalendarDayMobileHeading">
                                    <span>{format(day, "EEE")}</span>
                                    <strong>{format(day, "MMM d")}</strong>
                                </div>
                                {dayEvents.length > 0 ? (
                                    <div className="weeklyCalendarDayEvents">
                                        {dayEvents.map((event) => {
                                            const categories = categoriesFor(event);
                                            const category = categoryForEvent(event);
                                            return (
                                                <button
                                                    className={`weeklyEvent weeklyEvent-${category.toLowerCase()}`}
                                                    type="button"
                                                    key={event.eId}
                                                    aria-label={`${event.eName}, ${dayLabel} at ${eventTime(event)}`}
                                                    onClick={() => onSelectEvent?.(event)}
                                                >
                                                    <span className="weeklyEventTime">{eventTime(event)}</span>
                                                    <strong>{event.eName}</strong>
                                                    <span className="weeklyEventLocation">
                                                        <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />
                                                        {event.eLocation || "Location to be announced"}
                                                    </span>
                                                    <span className="weeklyEventCategories" aria-label="Categories">
                                                        {categories.map((eventCategory) => (
                                                            <span
                                                                className={`weeklyEventCategory weeklyEventCategory-${eventCategory.toLowerCase()}`}
                                                                key={eventCategory}
                                                            >
                                                                {eventCategory}
                                                            </span>
                                                        ))}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="weeklyCalendarEmpty" aria-hidden="true">
                                        <FontAwesomeIcon icon={faCalendarDay} />
                                        <span>Open day</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default WeeklyCalendar;
