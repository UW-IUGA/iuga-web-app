import useMediaQuery from "./useMediaQuery";

// How many resource cards go on a page, so each page ends on a full row. The widths match the tablet, sm-desktop,
// and desktop breakpoints in _variables.scss, where the card grid changes columns (see _resources.scss).
export default function useResourcePageSize() {
    const belowTablet = useMediaQuery("(max-width: 767px)");
    const belowSmDesktop = useMediaQuery("(max-width: 1023px)");
    const belowDesktop = useMediaQuery("(max-width: 1299px)");

    if (belowTablet) return 6;
    if (belowSmDesktop) return 8;
    if (belowDesktop) return 12;
    return 15;
}
