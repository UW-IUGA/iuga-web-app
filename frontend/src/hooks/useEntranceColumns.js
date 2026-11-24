/*
Purpose: The column count a card grid is using at the current width, so
         entranceGridOrder can number items left to right, then the next row.

Expected Request Information:
- minWidths: a module-level map of minimum widths (px) to column counts,
  matching the grid's CSS breakpoints.

Expected Response Information:
- The column count for the current window width, updated on resize.
*/
import { useEffect, useState } from "react";
import { columnsForWidth } from "../utils/pageEntrance";

export default function useEntranceColumns(minWidths) {
    const [columns, setColumns] = useState(() =>
        columnsForWidth(minWidths, typeof window === "undefined" ? 0 : window.innerWidth),
    );

    useEffect(() => {
        const update = () => setColumns(columnsForWidth(minWidths, window.innerWidth));
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [minWidths]);

    return columns;
}
