/*
Purpose: The Resources page's Start Here picks.

Expected Response Information:
- START_HERE: the pick names, shown two by two in this order (advising on top, then career and health).
- pickStartHere(resources): the picks found in the resources, in order; missing picks are skipped.
*/

export const START_HERE = [
    "iSchool Student Services",
    "iSchool Peer Advisors",
    "iSchool Career Services (Canvas)",
    "Husky Health & Well-Being",
];

export const pickStartHere = (resources) => START_HERE.flatMap((name) => {
    const resource = resources.find((candidate) => candidate.rName.trim() === name);
    return resource ? [resource] : [];
});
