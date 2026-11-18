import { Fragment } from "react";
import { WEEKDAY_ABBREVIATIONS } from "../../utils/calendar/calendar";

// Draws one month's frame: its title, its weekday header, and its weeks. Each
// day is drawn by `renderDay(cell, columnIndex)`, so the caller decides what a
// day looks like and what happens when it is used.
function Card({
    title,
    rows,
    renderDay,
    className,
    isCurrentMonth = false,
    isDayOverlayOpen = false,
    children,
}) {
    const cardClasses = ["card"];

    if (isCurrentMonth) {
        cardClasses.push("card--current");
    }

    if (className) {
        cardClasses.push(className);
    }

    return (
        <div className={cardClasses.join(" ")} aria-current={isCurrentMonth ? "date" : undefined}>
            {children}

            {/* While an overlay covers the grid, exclude it from keyboard
                navigation and the accessibility tree. */}
            <div className="card-grid" inert={isDayOverlayOpen ? "" : undefined}>
                {/* A heading, so a screen reader can move month to month in the year
            view the same way a sighted reader scans the titles. */}
                <div className="card-title">
                    <h2 className="card-title__heading">
                        {title}
                        {/* The outline is visual only, and aria-current on a card is not
                announced by every screen reader, so the heading says it too. */}
                        {isCurrentMonth && <span className="sr-only">, this month</span>}
                    </h2>
                </div>

                <div className="row weekday-header" aria-hidden="true">
                    {WEEKDAY_ABBREVIATIONS.map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>

                {rows.map((row) => (
                    <div className="row" key={row[0].id}>
                        {row.map((cell, columnIndex) => (
                            <Fragment key={cell.id}>{renderDay(cell, columnIndex)}</Fragment>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Card;
