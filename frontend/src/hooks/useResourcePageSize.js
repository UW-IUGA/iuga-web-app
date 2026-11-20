/*
Purpose: How many resource cards go on a page, so each page ends on a full row of the card grid.

Expected Response Information:
- 6 on phones, 8 on tablets, 12 on small laptops, 15 on desktops. The widths match the tablet, sm-desktop, and
  desktop breakpoints in _variables.scss, where the grid changes columns (see _resources.scss).
*/

import useMediaQuery from "./useMediaQuery";

export default function useResourcePageSize() {
    const belowTablet = useMediaQuery("(max-width: 767px)");
    const belowSmDesktop = useMediaQuery("(max-width: 1023px)");
    const belowDesktop = useMediaQuery("(max-width: 1299px)");

    if (belowTablet) return 6;
    if (belowSmDesktop) return 8;
    if (belowDesktop) return 12;
    return 15;
}
