// ── Page key definitions ───────────────────────────────────────────────────────
// Page keys are defined here in code. When a new feature is built, add its key
// to this list and it automatically appears as a checkbox in the Groups admin UI.
// Admin always has access to everything regardless of groups.

export interface PageDef {
  key: string;
  label: string;
  group: "tools" | "reporting";
}

export const ALL_PAGES: PageDef[] = [
  // Tools — standard user-facing features
  { key: "assist",      label: "Assist",         group: "tools" },
  { key: "breakdown",   label: "Breakdown",       group: "tools" },
  { key: "compare",     label: "Compare",         group: "tools" },
  { key: "summary",     label: "Summary",         group: "tools" },
  { key: "review",      label: "Review",          group: "tools" },
  { key: "matrix",      label: "Matrix",          group: "tools" },
  { key: "playbooks",   label: "Playbooks",       group: "tools" },
  { key: "suggestions", label: "Feedback Forum",  group: "tools" },
  // Reporting — elevated access
  { key: "audit",       label: "Audit Log",       group: "reporting" },
  { key: "usage",       label: "Usage & Cost",    group: "reporting" },
];

// Default pages assigned to the Staff group (and any new user)
export const STAFF_DEFAULT_PAGES = [
  "assist", "breakdown", "compare", "summary", "review",
  "matrix", "playbooks", "suggestions",
];

export const BILLING_DEFAULT_PAGES = [...STAFF_DEFAULT_PAGES, "usage"];
export const SECURITY_DEFAULT_PAGES = [...STAFF_DEFAULT_PAGES, "audit"];
