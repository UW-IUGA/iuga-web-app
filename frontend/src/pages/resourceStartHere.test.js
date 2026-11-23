import { resources } from "../assets/data/ResourcesData";
import { START_HERE, pickStartHere } from "./resourceStartHere";

describe("Start Here", () => {
    test("finds all four picks in the resources, in order", () => {
        expect(pickStartHere(resources).map(({ rName }) => rName.trim())).toEqual(START_HERE);
        expect(START_HERE).toEqual([
            "iSchool Student Services",
            "iSchool Peer Advisors",
            "iSchool Career Services (Canvas)",
            "Husky Health & Well-Being",
        ]);
    });
});
