import { describe, expect, test } from "vitest";
import { isProductionMode } from "./runtime";

describe("runtime mode detection", () => {
    test("development mode does not use production API behavior", () => {
        expect(isProductionMode("development")).toBe(false);
    });

    test("production mode uses production API behavior", () => {
        expect(isProductionMode("production")).toBe(true);
    });
});
