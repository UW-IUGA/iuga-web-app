import { render } from "@testing-library/react";
import { resources } from "../assets/data/ResourcesData";
import { resourceTypes } from "../assets/data/resourceTaxonomy";
import RsoMarquee from "./RsoMarquee";

describe("RsoMarquee", () => {
    // The marquee repeats each row once so the loop has no seam, so every logo appears exactly twice.
    test("shows each student club's logo once per loop, from every club area", () => {
        const { container } = render(<RsoMarquee playing={false} />);

        const shown = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
        const clubLogos = new Set(resources
            .filter(({ type, rImage }) => type === resourceTypes.CLUB && rImage)
            .map(({ rImage }) => rImage));
        expect(new Set(shown)).toEqual(clubLogos);
        expect(shown).toHaveLength(clubLogos.size * 2);
    });
});
