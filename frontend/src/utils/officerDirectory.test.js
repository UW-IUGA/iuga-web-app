import {
    AVAILABLE_OFFICERS,
    AVAILABLE_RSOS,
    resolveLeaderPhoto,
    resolveRsoLogo,
} from "./officerDirectory";

import yoniePhoto from "../assets/data/officerPhotos/2026/yonie.png";
import camiloPhoto from "../assets/data/officerPhotos/2025/camilo.JPG";
import michaelaPhoto from "../assets/data/officerPhotos/2024/officer_michaela.jpeg";
import brightPhoto from "../assets/data/officerPhotos/2024/officer_bright.png";
import winfoLogo from "../assets/logos/winfo-logo.jpeg";
import binfoLogo from "../assets/logos/binfo-logo.png";
import dubhacksLogo from "../assets/logos/dubhacks.jpg";
import dubhacksnextLogo from "../assets/logos/dubhacksnext.jpg";

describe("AVAILABLE_OFFICERS", () => {
    test("exposes the nine current 2026 officers with normalized fields", () => {
        expect(AVAILABLE_OFFICERS).toHaveLength(9);
        for (const officer of AVAILABLE_OFFICERS) {
            expect(officer.teamYear).toBe(2026);
            expect(officer.name).toBeTruthy();
            expect(officer.title).toBeTruthy();
            expect(officer.roleKey).toBeTruthy();
            expect(officer.profileKey).toMatch(/^2026_/);
            expect(officer.photo).toBeTruthy();
        }
    });

    test("maps the Director of Technology to the stable it slug", () => {
        const it = AVAILABLE_OFFICERS.find((o) => o.roleKey === "it");
        expect(it).toMatchObject({
            profileKey: "2026_it",
            name: "Yonie Rivera",
            shortTitle: "Dir. of IT",
        });
    });
});

describe("resolveLeaderPhoto", () => {
    test("resolves the current Director of IT by roleKey", () => {
        expect(resolveLeaderPhoto({ roleKey: "it" })).toBe(yoniePhoto);
    });

    test("resolves by name, trimming whitespace and ignoring case", () => {
        expect(resolveLeaderPhoto({ name: "Yonie Rivera" })).toBe(yoniePhoto);
        expect(resolveLeaderPhoto({ name: "  yoniE riveRa " })).toBe(yoniePhoto);
    });

    test("resolves historical officers by year and roleKey without defaulting to current", () => {
        expect(resolveLeaderPhoto({ teamYear: 2024, roleKey: "it" })).toBe(michaelaPhoto);
        expect(resolveLeaderPhoto({ teamYear: 2024, roleKey: "it" })).not.toBe(yoniePhoto);
    });

    test("resolves historical officers by profileKey", () => {
        expect(resolveLeaderPhoto({ teamYear: 2025, profileKey: "2025_it" })).toBe(camiloPhoto);
    });

    test("does not fall back across years for a matched historical name", () => {
        expect(resolveLeaderPhoto({ teamYear: 2024, name: "Bright Hoang" })).toBe(brightPhoto);
        expect(resolveLeaderPhoto({ name: "Bright Hoang" })).toBeNull(); // absent from 2026 roster
    });

    test("returns null for unknown or empty leaders", () => {
        expect(resolveLeaderPhoto({ roleKey: "treasurer" })).toBeNull();
        expect(resolveLeaderPhoto({ name: "Nobody" })).toBeNull();
        expect(resolveLeaderPhoto({ teamYear: 2030, roleKey: "it" })).toBeNull();
        expect(resolveLeaderPhoto(null)).toBeNull();
        expect(resolveLeaderPhoto(undefined)).toBeNull();
        expect(resolveLeaderPhoto({})).toBeNull();
        expect(resolveLeaderPhoto([])).toBeNull();
    });
});

describe("AVAILABLE_RSOS", () => {
    test("registers the IUGA parent org alongside affiliate RSOs", () => {
        const iuga = AVAILABLE_RSOS.find((rso) => rso.name === "IUGA");
        expect(iuga).toMatchObject({ name: "IUGA", logo: "/iuga-logo.png", link: "/" });
        expect(AVAILABLE_RSOS.some((rso) => rso.name === "Women in Informatics (Winfo)")).toBe(true);
        expect(AVAILABLE_RSOS.some((rso) => rso.name === "Black in Informatics (Binfo)")).toBe(true);
        expect(AVAILABLE_RSOS.some((rso) => rso.name === "DubHacks")).toBe(true);
        expect(AVAILABLE_RSOS.some((rso) => rso.name === "DubHacksNext")).toBe(true);
    });

    test("every entry exposes a name, logo, and link", () => {
        for (const rso of AVAILABLE_RSOS) {
            expect(typeof rso.name).toBe("string");
            expect("logo" in rso).toBe(true);
            expect(typeof rso.link).toBe("string");
        }
    });
});

describe("resolveRsoLogo", () => {
    test("resolves recognized RSOs case-insensitively", () => {
        expect(resolveRsoLogo("WINFO")).toBe(winfoLogo);
        expect(resolveRsoLogo("winfo")).toBe(winfoLogo);
        expect(resolveRsoLogo("Women in Informatics (Winfo)")).toBe(winfoLogo);
        expect(resolveRsoLogo("Binfo")).toBe(binfoLogo);
    });

    test("resolves the IUGA logo for the parent org", () => {
        expect(resolveRsoLogo("IUGA")).toBe("/iuga-logo.png");
    });

    test("prefers the most specific match in multi-organizer strings", () => {
        expect(resolveRsoLogo("IUGA and Winfo")).toBe(winfoLogo);
    });

    test("does not let DubHacks shadow DubHacksNext", () => {
        expect(resolveRsoLogo("DubHacks")).toBe(dubhacksLogo);
        expect(resolveRsoLogo("DubHacksNext")).toBe(dubhacksnextLogo);
    });

    test("returns null for unlisted student clubs", () => {
        expect(resolveRsoLogo("asd")).toBeNull();
        expect(resolveRsoLogo("DIY Student Club")).toBeNull();
        expect(resolveRsoLogo("Carl and Harold")).toBeNull();
        expect(resolveRsoLogo(null)).toBeNull();
        expect(resolveRsoLogo(undefined)).toBeNull();
        expect(resolveRsoLogo("")).toBeNull();
        expect(resolveRsoLogo(123)).toBeNull();
    });
});