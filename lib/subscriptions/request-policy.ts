import type { FeatureKey } from "./types";

export function isSubscriptionRead(method: string) {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** Account recovery and subscription payment must remain reachable after freezing. */
export function subscriptionWriteException(path: string) {
  return ["/api/auth/", "/api/account/", "/api/subscriptions/", "/api/admin/subscriptions/", "/api/admin/user-preview", "/api/announcements/"].some(root => path.startsWith(root))
    || path === "/api/display-mode" || path === "/api/portal/signature"
    // New reports enforce emergency-only access in the native authorized handler.
    || /^\/api\/portal\/tenants\/[^/]+\/defects$/.test(path)
    || /^\/api\/portal\/tenants\/[^/]+\/defects\/[^/]+\/entry-consent$/.test(path);
}

/** Downloading an already issued document never creates a new paid document. */
export function subscriptionFeatureForRequest(path: string, method: string, query?: URLSearchParams): FeatureKey | null {
  const read = isSubscriptionRead(method);
  if (/^\/api\/(?:portal\/tenants\/[^/]+\/|leases\/[^/]+\/)receipts$/.test(path)) {
    return read ? null : "paymentReceipts";
  }
  if (/^\/api\/leases\/[^/]+\/(?:contract(?:-preview)?|actions)$/.test(path)) {
    return "electronicContracts";
  }
  if (/^\/smlouvy\/[^/]+\/(?:nahled-smlouvy|pripravit)$/.test(path)) return "electronicContracts";
  // A recipient can read and acknowledge documents that were already delivered.
  if (path.startsWith("/api/portal/actions/")) return null;
  if (path === "/reporty" && query?.get("view") === "collections") return null;
  if (["/reporty", "/api/reports", "/api/reporting-groups", "/api/report-design-templates", "/api/rent-forecast-plans"].some(root => path === root || path.startsWith(root + "/"))) return "reports";
  if (/^\/nemovitosti\/[^/]+\/(?:reporting|nastaveni\/reporting|uvery|rozpocet)(?:\/|$)/.test(path)) return "reports";
  if (/^\/api\/properties\/[^/]+\/(?:reporting|loans|budgets|valuations|mf-rent|sale-benchmark)(?:\/|$)/.test(path)) return "reports";
  if (/^\/api\/properties\/[^/]+\/units\/[^/]+\/(?:personal-value|condition-assessments|condition-executions)(?:\/|$)/.test(path)) return "reports";
  if (/^\/api\/distribution\/properties\/[^/]+\/units\/[^/]+\/(?:valuations|assessments)(?:\/|$)/.test(path)) return "portfolioOversight";
  if (/^\/api\/properties\/[^/]+\/task-automation(?:\/|$)/.test(path)||/^\/nemovitosti\/[^/]+\/nastaveni\/automaticke-ukoly$/.test(path)) return "profi";
  if (/^\/platby\/(?:banka|nesparovane)(?:\/|$)/.test(path)) return "bankNotifications";
  if (path.startsWith("/api/bank-accounts/changes") || path.startsWith("/api/bank-accounts/notices/")) return null;
  if (/^\/api\/bank-accounts\/[^/]+\/check$/.test(path)) return "bankNotifications";
  if (["/api/bank-account-rules", "/api/inbound-payments"].some(root => path === root || path.startsWith(root + "/"))) return "bankNotifications";
  if (/^\/api\/properties\/[^/]+\/bank-email(?:\/|$)/.test(path)) return "bankNotifications";
  if (/^\/api\/properties\/[^/]+\/(?:matching|matching-rules|bank-expense-rules)(?:\/|$)/.test(path)) return "paymentMatching";
  if (/^\/api\/properties\/[^/]+\/bank-expenses(?:\/|$)/.test(path) && !read) return "paymentMatching";
  if (/^\/api\/properties\/[^/]+\/transactions\/[^/]+\/rule$/.test(path)) return "paymentMatching";
  return null;
}

export function subscriptionReason(code?: string) {
  if (code?.includes("CAPACITY") || code?.includes("LIMIT")) return "capacity";
  if (code?.includes("FROZEN") || code?.includes("READ_ONLY")) return "frozen";
  return "feature";
}
