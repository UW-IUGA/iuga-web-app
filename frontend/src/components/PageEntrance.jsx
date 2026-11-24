/*
Purpose: The site's shared entrance wave, as a small set of wrappers pages opt
         into. Timings, delay variables, the entering class, and overlay origin
         stay here; a page names its root, hero, grid, or list, and (for a grid)
         the column map that already matches its CSS.

Expected Request Information:
- PageRoot: the page's own class and, when a route should play once per
  session, a onceKey (Student Voice after sign-in).
- EntranceGrid: a module-level map of minimum widths to column counts, or a
  fixed column count, and optional startAt when earlier items already entered.
- OverlayEntrance: the trigger origin (a CSS position string or { x, y }) and
  whether the overlay is leaving.

Expected Response Information:
- A root that carries the entering class on a first visit.
- Children stamped with the shared item, list, or hero class and delay
  variables. An overlay that scales from its trigger.
*/
import { Children, cloneElement, isValidElement } from "react";
import useEntranceColumns from "../hooks/useEntranceColumns";
import usePageEntrance from "../hooks/usePageEntrance";
import {
    entranceGridStyle,
    entranceIndexStyle,
    overlayOriginStyle,
} from "../utils/pageEntrance";

export { default as usePageEntrance, useChromeEntrance } from "../hooks/usePageEntrance";

const classNames = (...parts) => parts.filter(Boolean).join(" ");

// Stable maps for a fixed column count, so resize listeners are not reattached
// when the parent re-renders with the same number.
const fixedColumnMaps = new Map();
const columnMap = (columns) => {
    if (typeof columns !== "number") return columns;
    let map = fixedColumnMaps.get(columns);
    if (!map) {
        map = { 0: columns };
        fixedColumnMaps.set(columns, map);
    }
    return map;
};

const stamp = (child, className, style) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, {
        className: classNames(child.props.className, className),
        style: { ...style, ...child.props.style },
    });
};

const originValue = (origin) => {
    if (origin == null) return undefined;
    if (typeof origin === "string") return origin;
    if (origin.x != null && origin.y != null) return `${origin.x} ${origin.y}`;
    return undefined;
};

export function PageRoot({
    onceKey,
    duration,
    as: Tag = "main",
    className,
    children,
    ...rest
}) {
    const entering = usePageEntrance({ onceKey, duration });
    return (
        <Tag className={classNames(className, entering && "pageEntrance--enter")} {...rest}>
            {children}
        </Tag>
    );
}

export function EntranceHero({ as: Tag = "div", index = 0, className, style, children, ...rest }) {
    return (
        <Tag
            className={classNames(className, "pageEntrance__hero")}
            style={entranceIndexStyle(index, style)}
            {...rest}
        >
            {children}
        </Tag>
    );
}

export function EntranceGrid({ columns, startAt = 0, children }) {
    const count = useEntranceColumns(columnMap(columns));
    return Children.map(children, (child, index) =>
        stamp(child, "pageEntrance__item", entranceGridStyle(startAt + index, count)),
    );
}

export function EntranceList({ startAt = 0, children }) {
    return Children.map(children, (child, index) =>
        stamp(child, "pageEntrance__listItem", entranceIndexStyle(startAt + index)),
    );
}

export function OverlayEntrance({
    origin,
    leaving = false,
    as: Tag = "div",
    className,
    style,
    children,
    ...rest
}) {
    return (
        <Tag
            className={classNames(className, "overlayEntrance", leaving && "overlayEntrance--leave")}
            style={overlayOriginStyle(originValue(origin), style)}
            {...rest}
        >
            {children}
        </Tag>
    );
}

// For pages with several early returns, where a PageRoot wrapper would call the
// first-visit hook a second time. Returns the page's class plus the entering
// class on a first visit.
export function usePageEntranceClass(className, options) {
    const entering = usePageEntrance(options);
    return classNames(className, entering && "pageEntrance--enter");
}
