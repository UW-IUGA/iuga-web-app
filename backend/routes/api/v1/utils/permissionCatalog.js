export const ADMIN_PERMISSIONS = Object.freeze([
  "users.roles.manage",
  "users.cycles.manage",
  "events.requests.view",
  "events.requests.create",
  "events.requests.edit",
  "events.leadership.approve",
  "events.meeting.manage",
  "events.finance.manage",
  "events.room.manage",
  "events.marketing.manage",
  "events.publication.manage",
  "events.purchases.complete",
  "events.operations.manage",
  "events.review.manage",
  "charter.read",
  "charter.manage",
  "journal.read",
  "journal.create",
  "journal.edit_own",
  "contacts.read",
  "contacts.manage",
  "dashboard.read",
  "notifications.read",
  "notifications.manage",
  "exports.manage",
  "cycles.archive",
]);

// Local preview intentionally exposes the complete admin surface so the full
// workflow can be tested before cycle-scoped assignments are configured.
export const ADMIN_PREVIEW_PERMISSIONS = Object.freeze([...ADMIN_PERMISSIONS]);

export const KNOWN_ADMIN_PERMISSIONS = new Set(ADMIN_PERMISSIONS);
export const ADMIN_PREVIEW_PERMISSION_SET = new Set(ADMIN_PREVIEW_PERMISSIONS);
