import { iugaTeams } from "../assets/data/AboutData";
import { resources } from "../assets/data/ResourcesData";
import { groupType, officerPositions, resourceTags } from "../assets/data/Enum";

export const CURRENT_YEAR = 2026;

/**
 * Falls back to a slugified position if it's missing from POSITION_ROLE_KEYS
    * (e.g. team_2015.js's undefined OPERATIONS reference). 
    * Returns null, not "undefined", if position is undefined.
 */

const POSITION_ROLE_KEYS = {
    [officerPositions.PRESIDENT]: "president",
    [officerPositions.COPRESIDENT]: "co-president",
    [officerPositions.VICE_PRESIDENT]: "vice-president",
    [officerPositions.FINANCE]: "finance",
    [officerPositions.CREATIVE]: "creative",
    [officerPositions.PUBLIC_RELATIONS]: "public-relations",
    [officerPositions.OUTREACH]: "outreach",
    [officerPositions.DIVERSITY]: "diversity",
    [officerPositions.IT]: "it",
    [officerPositions.ACADEMIC]: "academic",
    [officerPositions.FYR]: "fyr",
};

const ROLE_SHORT_TITLES = {
    president: "President", "co-president": "Co-President", "vice-president": "VP",
    finance: "Dir. of Finance", creative: "Creative Dir.", "public-relations": "Dir. of PR",
    outreach: "Dir. of Outreach", diversity: "Dir. of DEI", it: "Dir. of IT",
    academic: "Dir. of Academic", fyr: "FYR",
};

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const roleKeyForPosition = (position) => {
    if (POSITION_ROLE_KEYS[position]) return POSITION_ROLE_KEYS[position];
    const slug = String(position ?? "").trim().toLowerCase().replace(/\s+/g, "-");
    return slug || null;
}

const buildOfficerDirectory = () => {
    const officers = [];
    const usedProfileKeys = new Map();
    for (const [year, team] of Object.entries(iugaTeams)) {
        const teamYear = Number(year);
        (team[groupType.OFFICERS] ?? []).forEach((member, index) => {
            const roleKey = roleKeyForPosition(member.position) ?? `officer-${index + 1}`;
            const base = `${teamYear}_${roleKey}`;
            const occurrences = (usedProfileKeys.get(base) ?? 0) + 1;
            usedProfileKeys.set(base, occurrences);
            const profileKey = occurrences === 1 ? base : `${base}-${occurrences}`;
            officers.push({
                teamYear, roleKey, profileKey, name: member.name,
                title: member.position, shortTitle: ROLE_SHORT_TITLES[roleKey] ?? roleKey,
                photo: member.picture ?? null
            });
        });
    }
    return officers;
};

export const OFFICER_DIRECTORY = buildOfficerDirectory();
export const AVAILABLE_OFFICERS = OFFICER_DIRECTORY.filter((o) => o.teamYear === CURRENT_YEAR);

const byProfileKey = new Map(OFFICER_DIRECTORY.map((o) => [o.profileKey, o]));
const byYearRole = new Map(OFFICER_DIRECTORY.map((o) => [`${o.teamYear}:${o.roleKey}`, o]));
const byYearName = new Map(OFFICER_DIRECTORY.map((o) => [`${o.teamYear}:${normalize(o.name)}`, o]));

export const resolveLeaderPhoto = (leader) => {
    if (!leader || typeof leader !== "object" || Array.isArray(leader)) return null;

    if (leader.profileKey) {
        return byProfileKey.get(leader.profileKey)?.photo ?? null;
    }

    const teamYear = Number(leader.teamYear) || CURRENT_YEAR;

    if (leader.roleKey) {
        const byRole = byYearRole.get(`${teamYear}:${normalize(leader.roleKey)}`);
        if (byRole) return byRole.photo ?? null;
    }

    if (typeof leader.name === "string" && leader.name.trim()) {
        const byName = byYearName.get(`${teamYear}:${normalize(leader.name)}`);
        if (byName) return byName.photo ?? null;
    }

    return null;
}

const RSO_ALIASES = {
    "UX @ UW Club": ["ux@uw", "uxuw"],
    "AWS Student Builder Group @ UW": ["awssbguw", "aws student builders"],
    "Technology Consulting Association @ UW": ["tca"],
    "Product Space @ UW": ["product space"],
    "Claude Builder Club @ UW": ["claude"],
    "Figma @ UW": ["figma"], "Comet @ UW": ["comet"],
    "Husky Coding Project": ["hcp"], "DubsTech": ["dubstech"],
};

const IUGA_ORGANIZER = { name: "IUGA", logo: "/iuga-logo.png", link: "/" };

export const AVAILABLE_RSOS = [
    ...(resources[resourceTags.COMMUNITY] ?? []).map(({ rName, rImage, rLink }) => ({
        name: rName, logo: rImage ?? null, link: rLink ?? "",
    })),
    IUGA_ORGANIZER,
];

const parenthetical = (name) =>
    [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim().toLowerCase()).filter(Boolean);

const RSO_MATCHES = AVAILABLE_RSOS.map((rso) => ({
    logo: rso.logo,
    keys: [...new Set([rso.name.toLowerCase(), ...parenthetical(rso.name),
    ...(RSO_ALIASES[rso.name] ?? []).map((a) => a.toLowerCase())])]
        .sort((a, b) => b.length - a.length),
})).sort((a, b) => b.keys[0].length - a.keys[0].length);

export const resolveRsoLogo = (organizerName) => {
    if (typeof organizerName !== "string" || organizerName.trim() === "") return null;
    const haystack = organizerName.toLowerCase();
    for (const { logo, keys } of RSO_MATCHES) {
        if (logo && keys.some((key) => haystack.includes(key))) return logo;
    }
    return null;
};

