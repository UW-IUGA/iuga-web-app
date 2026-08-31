import { describe, expect, test } from "vitest";
import {
    centsToDollars,
    currentStage,
    dollarsToCents,
    quarterOf,
    weekOfQuarter,
} from "./eventRequest";

describe("eventRequest helpers", () => {
    test("currentStage returns the first incomplete checkpoint", () => {
        const request = { checkpoints: [
            { key: "proposal", status: "completed" },
            { key: "meeting", status: "completed" },
            { key: "room", status: "in_progress" },
            { key: "finance", status: "pending" },
        ] };
        expect(currentStage(request)).toBe("room");
    });

    test("currentStage returns complete when every checkpoint is done", () => {
        expect(currentStage({ checkpoints: [{ key: "proposal", status: "completed" }] })).toBe("complete");
    });

    test("dollarsToCents rounds valid input and flags invalid input", () => {
        expect(dollarsToCents("125.50")).toBe(12550);
        expect(dollarsToCents("")).toBeUndefined();
        expect(dollarsToCents("-1")).toBeNull();
        expect(dollarsToCents("abc")).toBeNull();
    });

    test("centsToDollars formats and passes through empty values", () => {
        expect(centsToDollars(12550)).toBe("125.50");
        expect(centsToDollars(null)).toBe("");
        expect(centsToDollars(undefined)).toBe("");
    });

    test("quarterOf and weekOfQuarter derive academic scheduling buckets", () => {
        expect(quarterOf(new Date(2026, 1, 15))).toBe("Q1");
        expect(quarterOf(new Date(2026, 10, 15))).toBe("Q4");
        expect(weekOfQuarter(new Date(2026, 0, 3))).toBe(1);
        expect(weekOfQuarter(new Date(2026, 0, 15))).toBe(3);
    });
});
