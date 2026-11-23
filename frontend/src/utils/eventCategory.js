/*
Purpose: Decide which one category an event is drawn in where there is room for only one.

Expected Request Information:
- event: an event record; its eLabels may be missing or hold labels outside the public categories.

Expected Response Information:
- primaryCategory(event) returns { name, className } for the event's first
  public category, or for Academic when it has none.
*/

import { categoriesFor } from "./eventStreams";

const PUBLIC_CATEGORIES = ["Academic", "Social", "Career"];
const FALLBACK_CATEGORY = "Academic";

export const primaryCategory = (event) => {
    const name = categoriesFor(event).find((category) => PUBLIC_CATEGORIES.includes(category)) ?? FALLBACK_CATEGORY;
    return { name, className: name.toLowerCase() };
};
