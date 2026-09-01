const API_PATH = "/api/v1/event-requests";

export const CHECKPOINTS = [
    ["proposal", "Proposal"],
    ["meeting", "Meeting"],
    ["room", "Room"],
    ["finance", "Finance"],
    ["marketing", "Marketing"],
    ["purchases", "Purchases"],
    ["review", "Review"],
];

// Display steps for the request stepper. Room booking is folded into Finance:
// the Finance step covers both the room and finance checkpoints.
export const STEPPER_STEPS = [
    { key: "proposal", label: "Proposal", checkpoints: ["proposal"] },
    { key: "meeting", label: "Meeting", checkpoints: ["meeting"] },
    { key: "finance", label: "Finance", checkpoints: ["room", "finance"] },
    { key: "marketing", label: "Marketing", checkpoints: ["marketing"] },
    { key: "purchases", label: "Purchases", checkpoints: ["purchases"] },
    { key: "review", label: "Review", checkpoints: ["review"] },
];

export function stepComplete(request, step) {
    return step.checkpoints.every((key) => request.checkpoints?.find((checkpoint) => checkpoint.key === key)?.status === "completed");
}

export const CANONICAL_STATES = new Set(["DRAFT", "PVP_REVIEW", "AGENDA", "FINANCE_REVIEW", "MARKETING_QUEUED", "SCHEDULED", "AWAITING_REVIEW", "REVIEWED", "REJECTED", "ARCHIVED"]);

const LEGACY_STATE_MAP = {
    draft: "DRAFT",
    submitted: "PVP_REVIEW",
    changes_requested: "DRAFT",
    approved: "SCHEDULED",
    denied: "REJECTED",
    completed: "REVIEWED",
    cancelled: "REJECTED",
};

export function canonicalState(status) {
    return LEGACY_STATE_MAP[status] || status;
}

// Ordered pipeline columns: canonical state -> board heading.
export const PIPELINE_COLUMNS = [
    ["DRAFT", "Proposal"],
    ["PVP_REVIEW", "P/VP review"],
    ["AGENDA", "Meeting"],
    ["FINANCE_REVIEW", "Finance"],
    ["MARKETING_QUEUED", "Marketing"],
    ["SCHEDULED", "Purchases"],
    ["AWAITING_REVIEW", "Review"],
];

export const DONE_STATES = new Set(["REVIEWED", "REJECTED", "ARCHIVED"]);

export async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_PATH}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
        throw new Error(data.message || "The request could not be completed.");
    }
    return data;
}

export function currentStage(request) {
    return request.checkpoints?.find((checkpoint) => checkpoint.status !== "completed")?.key || "complete";
}

export function quarterOf(date) {
    return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function weekOfQuarter(date) {
    const quarterStart = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
    return Math.ceil((date - quarterStart + 1) / (7 * 24 * 60 * 60 * 1000));
}

export function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function timeValue(value) {
    return value ? new Date(value).toISOString().slice(11, 16) : "";
}

export function dateValue(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function eventDateValue(request) {
    return request.eventDate || new Date(request.proposedStartDate).toISOString().slice(0, 10);
}

export function dollarsToCents(value) {
    if (value === "") return undefined;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function centsToDollars(value) {
    return value === undefined || value === null ? "" : (value / 100).toFixed(2);
}
