// Events are stored as "Career" or, in some records, "Professional"; both are shown as "Career".
// displayLabel is the single mapping point so no visible copy shows "Professional".
const DISPLAY_LABELS = { Professional: "Career" };

export const displayLabel = (label) =>
    Object.prototype.hasOwnProperty.call(DISPLAY_LABELS, label) ? DISPLAY_LABELS[label] : label;

export const categoriesFor = (event) => (event.eLabels ?? []).map(displayLabel);
