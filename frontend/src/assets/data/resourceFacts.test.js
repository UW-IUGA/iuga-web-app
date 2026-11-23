/*
Purpose: Characterization test for the Resources data. It freezes what every card shows (name, type and tags,
         bullets, description, link, logo) and the Start Here picks, so moving the data between modules cannot
         change the page. Regenerate the fixture only when a change to the page is intended.
*/
import { writeFileSync } from "node:fs";
import { resources } from "./ResourcesData";
import { pickStartHere, tagResources } from "./ResourceTagData";
import expected from "./__fixtures__/resource-facts.json";

function currentFacts() {
    const tagged = tagResources(resources);
    return {
        cards: tagged
            .map((resource) => ({
                name: resource.rName.trim(),
                tags: resource.tags,
                bullets: resource.highlights,
                description: resource.rDescription,
                link: resource.rLink,
                hasLogo: Boolean(resource.rImage),
                inset: Boolean(resource.rImageInset),
            }))
            .sort((first, second) => first.name.localeCompare(second.name)),
        startHere: pickStartHere(tagged).map((resource) => resource.rName.trim()),
    };
}

test("every card and Start Here pick shows the same facts as before", () => {
    if (process.env.WRITE_RESOURCE_FACTS) {
        writeFileSync("src/assets/data/__fixtures__/resource-facts.json", `${JSON.stringify(currentFacts(), null, 2)}\n`);
    }
    expect(currentFacts()).toEqual(expected);
});
