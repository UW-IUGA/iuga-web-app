/*
Purpose: The Resources page's filter tags and search words.

Expected Response Information:
- resourceTypes: who runs a resource, the value of each record's `type`.
- tagGroups and allTags: the filter tags, by group.
- labelsOf(resource): a resource's type followed by its tags, as the filters and search see them.
- searchSynonyms: search-only alternate words.
- tagForCategory: the tag each of the original page's ?category= values opens (still linked from Home).
*/

import { resourceTags } from "./Enum";

export const resourceTypes = {
    CLUB: "Student clubs",
    ISCHOOL: "iSchool",
    UW: "UW",
};

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
        label: "Interests",
        tags: [
            "SWE", "Cybersecurity", "Product Management", "AI/ML", "Data", "Design", "Consulting", "Entrepreneurship",
            "Projects", "Leadership",
        ],
    },
];

export const allTags = tagGroups.flatMap((group) => group.tags);

export const labelsOf = (resource) => [resource.type, ...resource.tags];

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
    ux: ["design"],
    ui: ["ux", "design"],
    security: ["cybersecurity"],
    cybersecurity: ["security"],
    cyber: ["security"],
    infosec: ["cybersecurity", "information security"],
    pm: ["product management"],
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
