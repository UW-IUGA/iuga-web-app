// Development-only thumbnail enrichment for the mock calendar feed, whose
// events carry no eThumbnailPath. Resolution is two-tier: the stable eId map
// wins first, then a documented eName fallback — only for names that occur
// exactly once, so generic duplicates can never resolve ambiguously — then a
// deterministic gallery default. Import assets, never raw "/assets/..." strings.
import bowling from "../assets/gallery/bowling.jpeg";
import gamenight from "../assets/gallery/gamenight.png";
import gamenight2 from "../assets/gallery/gamenight-2.png";
import groups from "../assets/gallery/groups.png";
import heart from "../assets/gallery/heart.jpeg";
import officers from "../assets/gallery/officers-22.png";
import panelists from "../assets/gallery/panelists.png";

// Tier 1: stable mock eIds mapped to imported assets; eName for readability.
const THUMBNAIL_BY_EID = {
    "662450848a5036a39183aa2e": panelists, // Industry Panel + Networking
    "662488756c91a19331137491": gamenight, // IUGA Game Night
    "6624894e8bc2dc963685744b": gamenight2, // Game Night: Board Games
    "662489d99439ba32a867eeb1": groups, // Study Jam
    "662490263e10daba38e25686": bowling, // Bowling at UW
    "6624e529ae578c7b130f052f": heart, // IUGA Community Social
    "66258a516e1b2e1c40f2f759": officers, // Officer Meet & Greet
};

// Tier 2: eName fallback for uniquely named mock events whose eId is missing
// or changed. Only names that occur once across the mock calendar belong
// here; ambiguous names use the deterministic gallery fallback below.
const THUMBNAIL_BY_NAME = {
    "Industry Panel + Networking": panelists,
    "IUGA Game Night": gamenight,
    "Game Night: Board Games": gamenight2,
    "Study Jam": groups,
    "Bowling at UW": bowling,
    "IUGA Community Social": heart,
    "Officer Meet & Greet": officers,
};

const DEFAULT_THUMBNAILS = [groups, gamenight, bowling, heart, panelists, gamenight2, officers];

// Returns a NEW array of NEW event objects (inputs are never mutated).
export const enrichWithDevThumbnails = (events) => {
    const nameCounts = events.reduce((counts, event) => {
        counts[event.eName] = (counts[event.eName] ?? 0) + 1;
        return counts;
    }, {});
    return events.map((event, index) => {
        const thumbnail =
            event.eThumbnailPath ??
            THUMBNAIL_BY_EID[event.eId] ??
            (nameCounts[event.eName] === 1 ? THUMBNAIL_BY_NAME[event.eName] : undefined) ??
            DEFAULT_THUMBNAILS[index % DEFAULT_THUMBNAILS.length];
        return { ...event, eThumbnailPath: thumbnail };
    });
};
