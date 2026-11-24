import { describe, expect, it } from "vitest";
import { entranceOrder, entranceRow } from "./motion";

describe("entranceOrder", () => {
    it("sets a 0-based --entrance-i, keeping any other style", () => {
        expect(entranceOrder(3, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-i": 3,
        });
    });
});

describe("entranceRow", () => {
    it("sets --entrance-row, keeping any other style", () => {
        expect(entranceRow(2, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-row": 2,
        });
    });
});

