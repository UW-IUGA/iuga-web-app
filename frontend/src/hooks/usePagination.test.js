import { act, renderHook } from "@testing-library/react";
import usePagination from "./usePagination";

const items = Array.from({ length: 29 }, (_, index) => index + 1);

describe("usePagination", () => {
    test("shows the first page", () => {
        const { result } = renderHook(() => usePagination(items, 15));
        expect(result.current.pageItems).toEqual(items.slice(0, 15));
        expect(result.current).toMatchObject({ page: 1, pageCount: 2 });
    });

    test("moves to a later page", () => {
        const { result } = renderHook(() => usePagination(items, 15));
        act(() => result.current.setPage(2));
        expect(result.current.pageItems).toEqual(items.slice(15));
        expect(result.current.page).toBe(2);
    });

    test("goes back to the first page when the list changes", () => {
        const { result, rerender } = renderHook(({ list }) => usePagination(list, 15), { initialProps: { list: items } });
        act(() => result.current.setPage(2));
        rerender({ list: items.slice(0, 20) });
        expect(result.current.page).toBe(1);
    });

    test("stays on the page holding the first item in view when the page size changes", () => {
        const { result, rerender } = renderHook(({ size }) => usePagination(items, size), { initialProps: { size: 6 } });
        act(() => result.current.setPage(3));
        expect(result.current.pageItems[0]).toBe(13);

        rerender({ size: 8 });

        expect(result.current.page).toBe(2);
        expect(result.current.pageItems).toContain(13);
    });

    test("has one empty page for an empty list", () => {
        const { result } = renderHook(() => usePagination([], 15));
        expect(result.current).toMatchObject({ page: 1, pageCount: 1, pageItems: [] });
    });
});
