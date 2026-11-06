import { describe, expect, it } from "vitest";
import { resources } from "./ResourcesData";
import { tagResources } from "./ResourceTagData";

const taggedResources = tagResources(resources);

describe("resource bullet highlights", () => {
    it("gives every resource one to three bullets", () => {
        taggedResources.forEach(({ rName, highlights }) => {
            expect(highlights.length, rName).toBeGreaterThanOrEqual(1);
            expect(highlights.length, rName).toBeLessThanOrEqual(3);
        });
    });

    it("writes bullets without colons or semicolons", () => {
        taggedResources
            .flatMap(({ highlights }) => highlights)
            .forEach((text) => expect(text).not.toMatch(/[:;]/));
    });
});
