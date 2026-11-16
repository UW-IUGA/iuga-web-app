/*
 * Purpose: Split a list into fixed-size pages for the Resources page.
 * Expected Request: The full list and how many items go on each page.
 * Expected Response: The current page's items, the page number and page count, the range shown, and setPage.
 */
import { useState } from "react";

function usePagination(items, pageSize) {
    const [page, setPage] = useState(1);
    const [previousPageSize, setPreviousPageSize] = useState(pageSize);
    const [previousItems, setPreviousItems] = useState(items);

    // A new search or filter produces a new list, which starts back on the first page. This happens during render,
    // not in an effect, so the old page number is never drawn with the new list.
    //
    // A new page size (the window was resized or rotated) stays on the page holding the first item in view. When
    // both change at once, the new list wins and the size is caught up on the next render.
    if (items !== previousItems) {
        setPreviousItems(items);
        setPage(1);
    } else if (pageSize !== previousPageSize) {
        setPreviousPageSize(pageSize);
        setPage(Math.floor(((page - 1) * previousPageSize) / pageSize) + 1);
    }

    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const currentPage = Math.min(page, pageCount);

    const start = (currentPage - 1) * pageSize;

    return {
        page: currentPage,
        pageCount,
        setPage,
        pageItems: items.slice(start, start + pageSize),
        firstShown: items.length > 0 ? start + 1 : 0,
        lastShown: Math.min(start + pageSize, items.length),
        total: items.length,
    };
}

export default usePagination;
