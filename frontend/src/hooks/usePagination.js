/*
 * Purpose: Split a list into fixed-size pages for the Resources page.
 * Expected Request: The full list and how many items go on each page.
 * Expected Response: The current page's items, the page number and page count, the range shown, and setPage.
 */
import { useEffect, useState } from "react";

function usePagination(items, pageSize) {
    const [page, setPage] = useState(1);
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const currentPage = Math.min(page, pageCount);

    // A new search, filter, or sort produces a new list, which starts back on the first page.
    useEffect(() => {
        setPage(1);
    }, [items]);

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
