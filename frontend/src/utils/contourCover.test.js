import { contourLines } from "./contourCover";

describe("contourLines", () => {
    test("the same event id always draws the same lines", () => {
        expect(contourLines("662488756c91a19331137491")).toEqual(contourLines("662488756c91a19331137491"));
    });

    test("different event ids draw different lines", () => {
        expect(contourLines("662488756c91a19331137491")).not.toEqual(contourLines("6624894e8bc2dc963685744b"));
    });

    test("draws closed lines, with every third one emphasized like a map's index lines", () => {
        const lines = contourLines("study-jam");

        expect(lines.length).toBeGreaterThan(6);
        lines.forEach((line) => expect(line.d).toMatch(/^M[\d.-]+ [\d.-]+.*Z$/));
        expect(lines.filter((line) => line.emphasized)).toHaveLength(Math.floor(lines.length / 3));
    });

    test("an event with no id still gets a drawing", () => {
        expect(contourLines(undefined).length).toBeGreaterThan(0);
    });
});
