// The backend's legacy label "Career" is displayed as "Professional";
// displayLabel is the single mapping point so no visible copy renders the legacy term.
const DISPLAY_LABELS = { Career: "Professional" };

export const displayLabel = (label) =>
    Object.prototype.hasOwnProperty.call(DISPLAY_LABELS, label) ? DISPLAY_LABELS[label] : label;

export const categoriesFor = (event) => (event.eLabels ?? []).map(displayLabel);
