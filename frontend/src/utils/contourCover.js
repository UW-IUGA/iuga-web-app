/*
Purpose: Draw the contour lines that stand in for a missing event photo.

Expected Request Information:
- key: the event's id. Any string; a missing id still draws.

Expected Response Information:
- contourLines(key) returns [{ d, emphasized }]: closed SVG paths in a 200 × 100
  box, ringing one peak. The same key always gives the same lines, so an event
  keeps its picture between visits; every third line is emphasized, like the
  index lines on a topographic map.
*/

export const CONTOUR_WIDTH = 200;
export const CONTOUR_HEIGHT = 100;

const LINE_COUNT = 13;
const LINE_SPACING = 9;
const POINTS_PER_LINE = 72;

// FNV-1a: a stable 32-bit number from the key.
function hashKey(key) {
    let hash = 2166136261;
    for (const char of String(key ?? "")) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

// Mulberry32: a small seeded generator, so the drawing depends only on the key.
function seededRandom(seed) {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function contourLines(key) {
    const random = seededRandom(hashKey(key));
    const peakX = 30 + random() * 140;
    const peakY = 15 + random() * 70;
    const phase = random() * Math.PI * 2;
    const lobes = 2 + Math.floor(random() * 3);

    return Array.from({ length: LINE_COUNT }, (_, index) => {
        const level = index + 1;
        const radius = level * LINE_SPACING;
        const points = Array.from({ length: POINTS_PER_LINE }, (__, step) => {
            const angle = (step / POINTS_PER_LINE) * Math.PI * 2;
            const r = radius * (1 + 0.16 * Math.sin(lobes * angle + phase + level * 0.35));
            const x = peakX + r * Math.cos(angle) * 1.35;
            const y = peakY + r * Math.sin(angle);
            return `${x.toFixed(1)} ${y.toFixed(1)}`;
        });
        return { d: `M${points.join("L")}Z`, emphasized: level % 3 === 0 };
    });
}
