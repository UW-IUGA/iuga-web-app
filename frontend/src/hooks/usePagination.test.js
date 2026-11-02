import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import usePagination from "./usePagination";

const items = Array.from({ length: 29 }, (_, index) => index + 1);

describe("usePagination", () => {
    it("shows the first page and the range on it", () => {
        const { result } = renderHook(() => usePagination(items, 15));
        expect(result.current.pageItems).toEqual(items.slice(0, 15));
        expect(result.current).toMatchObject({ page: 1, pageCount: 2, firstShown: 1, lastShown: 15, total: 29 });
    });

    it("moves to a later page", () => {
        const { result } = renderHook(() => usePagination(items, 15));
        act(() => result.current.setPage(2));
        expect(result.current.pageItems).toEqual(items.slice(15));
        expect(result.current).toMatchObject({ page: 2, firstShown: 16, lastShown: 29 });
    });

    it("goes back to the first page when the list changes", () => {
        const { result, rerender } = renderHook(({ list }) => usePagination(list, 15), { initialProps: { list: items } });
        act(() => result.current.setPage(2));
        rerender({ list: items.slice(0, 20) });
        expect(result.current.page).toBe(1);
    });

    it("has one empty page for an empty list", () => {
        const { result } = renderHook(() => usePagination([], 15));
        expect(result.current).toMatchObject({ page: 1, pageCount: 1, firstShown: 0, lastShown: 0, pageItems: [] });
    });
});
