import { describe, expect, it } from "vitest";
import { entranceIndexStyle, entranceRowStyle } from "./motion";

describe("entranceIndexStyle", () => {
    it("sets a 0-based --entrance-i, keeping any other style", () => {
        expect(entranceIndexStyle(3, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-i": 3,
        });
    });
});

describe("entranceRowStyle", () => {
    it("sets --entrance-row, keeping any other style", () => {
        expect(entranceRowStyle(2, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-row": 2,
        });
    });
});

