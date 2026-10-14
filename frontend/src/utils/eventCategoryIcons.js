/*
Purpose: Decide how an event is drawn where there is room for only one of its categories.

Expected Request Information:
- event: an event record; its eLabels may be missing or hold labels outside the public categories.

Expected Response Information:
- primaryCategory(event) returns { name, icon, className } for the event's first
  public category, or for Academic when it has none.
*/

import { faBriefcase, faGraduationCap, faUsers } from "@fortawesome/free-solid-svg-icons";
import { categoriesFor } from "./eventStreams";

const CATEGORY_ICONS = {
    Academic: faGraduationCap,
    Social: faUsers,
    Professional: faBriefcase,
};

const FALLBACK_CATEGORY = "Academic";

export const primaryCategory = (event) => {
    const name =
        categoriesFor(event).find((category) => Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, category)) ??
        FALLBACK_CATEGORY;
    return { name, icon: CATEGORY_ICONS[name], className: name.toLowerCase() };
};
