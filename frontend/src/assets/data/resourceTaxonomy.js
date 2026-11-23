/*
Purpose: The Resources page's filter tags and search words.

Expected Response Information:
- resourceTypes: who runs a resource, the value of each record's `type`.
- clubAreas: the club areas, in the order the page lists them.
- tagGroups and allTags: the filter tags, by group.
- offerings: what a club can offer, in the order cards list them; shown on cards and searched, not filtered.
- offersOf(resource): the resource's offerings in that order, or none.
- labelsOf(resource): a resource's type followed by its tags, as the filters and search see them.
- sectionsOf(resources): the unfiltered page's sections, each { heading, resources }, keeping the given order
  within each; empty sections are left out.
- searchSynonyms: search-only alternate words.
- tagForCategory: the tag each of the original page's ?category= values opens (still linked from Home).
*/

import { resourceTags } from "./Enum";

export const resourceTypes = {
    CLUB: "Student clubs",
    ISCHOOL: "iSchool",
    UW: "UW",
};

// Abe's sections of the iSchool's student clubs, in his order. Each club sits in one.
export const clubAreas = [
    "iOrgs",
    "PM/Consulting",
    "Entrepreneurship",
    "Software Engineering",
    "DS/ML",
    "UI/UX",
    "Cybersecurity",
];

// "Who runs it" holds each record's type; the other groups hold its tags. Social, Career and Community are left
// out on purpose: every club is social, and those labels belong to Events.
export const tagGroups = [
    {
        label: "Who runs it",
        tags: Object.values(resourceTypes),
    },
    {
        label: "What it helps with",
        tags: ["Academic", "Jobs & internships", "Mental Health", "DEI"],
    },
    {
        label: "Club area",
        tags: clubAreas,
    },
];

export const allTags = tagGroups.flatMap((group) => group.tags);

export const offerings = ["Project teams", "Hackathon", "Competition", "Career panels"];

export const offersOf = (resource) => offerings.filter((offer) => resource.offers?.includes(offer));

export const labelsOf = (resource) => [resource.type, ...resource.tags];

// Support services first, then each club area. An iSchool or UW group in an area (such as the iStartup Lab) sits
// with its clubs. "More clubs" catches a club added without an area, so it still shows; the data tests keep it empty.
export const sectionsOf = (resources) => {
    const hasArea = ({ tags }) => tags.some((tag) => clubAreas.includes(tag));
    const isClub = ({ type }) => type === resourceTypes.CLUB;
    return [
        { heading: "Support", resources: resources.filter((resource) => !isClub(resource) && !hasArea(resource)) },
        ...clubAreas.map((area) => ({ heading: area, resources: resources.filter(({ tags }) => tags.includes(area)) })),
        { heading: "More clubs", resources: resources.filter((resource) => isClub(resource) && !hasArea(resource)) },
    ].filter((section) => section.resources.length > 0);
};

// Search-only alternate words: typing a key also finds resources matching its values (plurals are handled
// automatically). These are never shown on the page.
export const searchSynonyms = {
    job: ["career"],
    internship: ["career"],
    resume: ["career", "jobs"],
    career: ["jobs", "internships"],
    therapy: ["therapist", "counseling", "mental health"],
    therapist: ["counseling", "mental health"],
    counselor: ["counseling", "mental health"],
    wellness: ["well-being", "mental health"],
    tutor: ["tutoring"],
    advisor: ["advising"],
    advising: ["advisor"],
    advice: ["advising", "advisor"],
    coding: ["swe", "software engineering"],
    programming: ["coding", "swe", "software engineering"],
    software: ["swe"],
    developer: ["swe", "software engineering"],
    swe: ["software engineering"],
    ux: ["design"],
    ui: ["ux", "design"],
    design: ["ui/ux"],
    ai: ["ds/ml"],
    data: ["ds/ml"],
    machine: ["ds/ml"],
    product: ["pm/consulting"],
    security: ["cybersecurity"],
    cybersecurity: ["security"],
    cyber: ["security"],
    infosec: ["cybersecurity", "information security"],
    pm: ["product management", "pm/consulting"],
    consulting: ["consult"],
    startup: ["entrepreneurship"],
    founder: ["entrepreneurship"],
    community: ["club"],
    social: ["club"],
    diversity: ["dei"],
    rso: ["club"],
    org: ["club"],
    organization: ["club"],
    international: ["f-1"],
};

export const tagForCategory = {
    [resourceTags.ACADEMIC]: "Academic",
    [resourceTags.CAREER]: "Jobs & internships",
    [resourceTags.COMMUNITY]: resourceTypes.CLUB,
    [resourceTags.MENTAL_HEALTH]: "Mental Health",
    [resourceTags.DEI]: "DEI",
};
