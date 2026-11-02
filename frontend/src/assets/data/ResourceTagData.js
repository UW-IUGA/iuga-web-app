/*
 * Purpose: Tag data for the Resources page: the tag groups, search synonyms, and how today's categorized
 *   resources become tagged ones.
 * Expected Request: Imported by the Resources page and useResourceFilters.
 * Expected Response: The full tag list, tag groups, tagResources() for the resources grouped by category, and
 *   pickStartHere() for the Start Here picks.
 */
import { resourceTags } from "./Enum";

// Type says who runs a resource; support tags replace the old fixed categories; interest tags are new
// and not yet assigned to any resource.
export const tagGroups = [
    {
        label: "Type",
        tags: ["RSO", "iSchool", "UW"],
    },
    {
        label: "Support",
        tags: ["Academic", "Career", "Community", "Mental Health", "DEI"],
    },
    {
        label: "Interests",
        tags: ["SWE", "Cybersecurity", "Product Management", "AI/ML", "Data", "Design", "Consulting", "Projects", "Leadership"],
    },
];

export const allTags = tagGroups.flatMap((group) => group.tags);

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
    diversity: ["dei"],
    club: ["rso"],
    org: ["rso"],
    organization: ["rso"],
    international: ["f-1"],
};

// Maps the old ?category= values (still linked from the Home page) to their tags.
export const tagForCategory = {
    [resourceTags.ACADEMIC]: "Academic",
    [resourceTags.CAREER]: "Career",
    [resourceTags.COMMUNITY]: "Community",
    [resourceTags.MENTAL_HEALTH]: "Mental Health",
    [resourceTags.DEI]: "DEI",
};

// Short bullets restating each resource's rDescription; they add nothing the description does not say.
const highlights = {
    "iSchool Student Services": [
        "Graduate admissions, academic, and career advisors",
        "Most programs host appointments online or in person",
        "Support exploring and pursuing opportunities that align with your life and career goals",
    ],
    "iSchool Peer Advisors": [
        "The Informatics Peer Advisor team meets with students",
        "For current INFO students and UW students considering applying to the Informatics major",
    ],
    "UW CLUE Program": [
        "Academic support and tutoring program",
        "Designed to help students succeed in their UW coursework",
    ],
    "iSchool Career Services (Canvas)": [
        "One-on-one advising for professional development goals and the job search",
        "Help with job search strategies and specific opportunities",
        "Resume and cover letter feedback, plus interview advice and practice",
    ],
    "iMentorship": [
        "Work closely, one-on-one, with an information professional",
        "Insight, guidance, and support, plus a jumpstart on your professional network",
        "For BS in Informatics and MSIM students",
    ],
    "Curricular Practical Training for F-1 Students": [
        "Work authorization for students on F-1 visas while studying at UW",
        "Learn practical skills through activities related to your major",
    ],
    "Post Completion OPT for F-1 Students": [
        "Temporary work authorization in the United States",
        "For international students on F-1 visas",
    ],
    "On-campus Employment for F-1 Students": [
        "On-campus work option for F-1 international students",
        "Earn money and gain work experience while maintaining your visa status",
    ],
    "Husky Health & Well-Being": [
        "Medical care and counseling services",
        "Recreation classes, safety resources, peer health advocacy, and trainings",
        "Most services are limited to currently enrolled UW Seattle students",
    ],
    "Leigh Eisele, LMHC, LCPC, NCC": [
        "Clinical mental health therapist",
        "Liaison to the College of Built Environments and the iSchool",
    ],
    "iSchool Office of IDEAS ": [
        "Celebrates inclusion and connectedness at the iSchool as essential to academic excellence",
    ],
    "Diversity @ UW": [
        "Diversity, equity, inclusion, and belonging as integral to excellence at UW",
        "Strives to create accessible, welcoming, and respectful learning environments",
        "Promotes access, opportunity, and justice for all",
    ],
    "Black in Informatics (Binfo)": [
        "Community-driven organization for Black students in the Informatics program",
        "Resources, mentorship, and specialized learning experiences",
        "Fosters professional, academic, and personal development",
    ],
    "iMuslims": [
        "Student-led resources and community for Muslim students at the iSchool",
        "Events that promote connection, establish networks, and build professional skills",
        "All students welcome at events; follow @imuslims.uw on Instagram",
    ],
    "iQueeries": [
        "Safe, positive space for LGBTQIA+ and supportive ally students in the iSchool",
        "Promotes positive change and social justice in the information sciences",
        "Intersectional: all identities and experiences are welcome",
    ],
    "ISACA": [
        "For students interested in learning about information security and risk",
        "Workshops and events on basic information security procedures and best practices",
    ],
    "Women in Informatics (Winfo)": [
        "Empowers women to thrive as producers of technology",
        "Supportive network of women in technology fields",
        "Mentorship, resources, and support for career development and academic pursuits",
    ],
    "DubHacks": [
        "Tech and entrepreneurship nonprofit in Seattle run by UW students",
        "Brings together students of all backgrounds to tackle the issues they're most passionate about",
    ],
    "DubHacksNext": [
        "16-week program turning UW students into funded startup founders",
        "Intensive mentorship, resources, and community",
    ],
    "Claude Builder Club @ UW": [
        "Learn and build with AI",
        "Backed by Claude",
    ],
    "UX @ UW Club": [
        "Community for students who want to grow their UX skills",
        "Open to students of all levels",
    ],
    "AWS Student Builder Group @ UW": [
        "Helping Huskies explore, build, and connect through cloud tech",
        "Powered by AWS",
    ],
    "Product Space @ UW": [
        "Cultivating tomorrow's product leaders",
        "Part of a nationwide family of students in product",
    ],
    "Figma @ UW": [
        "Making design accessible for everyone",
        "Bringing Figma closer to UW",
    ],
    "Comet @ UW": [
        "Browse at the speed of thought",
        "Managed by Perplexity Campus Ambassadors",
    ],
    "DubsTech": [
        "UW's largest tech community",
        "Hosts workshops, hackathons, and talks",
        "Covers design, data science, and software engineering",
    ],
    "CSeed": [
        "Inspiring engineering and design students at UW to build what they care about",
    ],
    "Husky Coding Project": [
        "Your launchpad for tech teamwork at UW",
        "Gain group project work experience in the tech field",
        "Open to students regardless of major or background",
    ],
    "Technology Consulting Association @ UW": [
        "The premier technology consultancy",
    ],
};

const iSchoolServices = [
    "iSchool Student Services",
    "iSchool Peer Advisors",
    "iSchool Career Services (Canvas)",
    "iMentorship",
    "iSchool Office of IDEAS ",
];

// Community listings are student orgs; every other non-iSchool listing is a UW-wide service.
const typeFor = (category, name) => {
    if (category === resourceTags.COMMUNITY) return "RSO";
    return iSchoolServices.includes(name) ? "iSchool" : "UW";
};

// Until real tags exist, each resource carries its type plus the tag of the category it is listed under today.
export const tagResources = (resourcesByCategory) => Object.entries(resourcesByCategory).flatMap(([category, items]) =>
    items.map((resource) => ({
        ...resource,
        tags: [typeFor(category, resource.rName), tagForCategory[category]],
        highlights: highlights[resource.rName] ?? [],
    }))
);

// Notes are one-line summaries of each rDescription.
const START_HERE = [
    { name: "iSchool Student Services", note: "Graduate admissions, academic, and career advising." },
    { name: "iSchool Career Services (Canvas)", note: "Job search help, resume feedback, and interview practice." },
    { name: "Husky Health & Well-Being", note: "Medical care, counseling, and wellness services at UW Seattle." },
    { name: "iSchool Office of IDEAS ", note: "Celebrates inclusion and connectedness at the iSchool." },
];

// The Start Here picks found in the tagged resources, each with its note; picks that are missing are skipped.
export const pickStartHere = (taggedResources) => START_HERE.flatMap(({ name, note }) => {
    const resource = taggedResources.find((candidate) => candidate.rName === name);
    return resource ? [{ ...resource, note }] : [];
});
