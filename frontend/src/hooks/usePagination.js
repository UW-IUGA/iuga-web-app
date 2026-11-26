/*
Purpose: Split a list into fixed-size pages for the Resources page.

Expected Request Information:
- items: the full list. A new list (a new search or filter) starts back on page 1.
- pageSize: how many items go on each page.

Expected Response Information:
- page, pageCount, setPage, and pageItems (the items on the current page).
*/

import { useState } from "react";

export default function usePagination(items, pageSize) {
    const [page, setPage] = useState(1);
    const [previousItems, setPreviousItems] = useState(items);
    const [previousPageSize, setPreviousPageSize] = useState(pageSize);

    // Reset during render rather than in an effect, so the old page is never drawn with the new list. A new page
    // size (the window was resized) keeps the first item in view on screen.
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
    };
}
