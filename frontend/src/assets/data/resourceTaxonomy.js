/*
Purpose: The Resources page's filter tags and search words.

Expected Response Information:
- tagGroups and allTags: the filter tags, by group.
- labelsOf(resource): a resource's type followed by its tags, as the filters and search see them.
- searchSynonyms: search-only alternate words.
- tagForCategory: the tag each of the original page's ?category= values opens (still linked from Home).
*/

import { resourceTags } from "./Enum";

// Type says who runs a resource; Support and Interests are topics.
export const tagGroups = [
    {
        label: "Type",
        tags: ["RSO", "iSchool", "UW"],
    },
    {
        label: "Support",
        tags: ["Academic", "Career", "Social", "Mental Health", "DEI"],
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
    resume: ["career"],
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
    community: ["social"],
    diversity: ["dei"],
    club: ["rso"],
    org: ["rso"],
    organization: ["rso"],
    international: ["f-1"],
};

export const tagForCategory = {
    [resourceTags.ACADEMIC]: "Academic",
    [resourceTags.CAREER]: "Career",
    [resourceTags.COMMUNITY]: "Social",
    [resourceTags.MENTAL_HEALTH]: "Mental Health",
    [resourceTags.DEI]: "DEI",
};
