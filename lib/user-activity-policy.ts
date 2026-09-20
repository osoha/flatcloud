export const ONLINE_WINDOW_MS = 2 * 60_000;
export const INACTIVE_WINDOW_MS = 30 * 24 * 60 * 60_000;
export const activityViews = ["name", "online", "inactive", "unseen"] as const;
export type ActivityView = typeof activityViews[number];
export function latestActivityAt(seen?: Date | null, login?: Date | null) {
  if (!seen) return login || null;
  if (!login) return seen;
  return seen.getTime() >= login.getTime() ? seen : login;
}
export function parseActivityView(value?: string): ActivityView {
  return activityViews.includes(value as ActivityView) ? value as ActivityView : "name";
}
export function isUserOnline(active: boolean, seen: Date | null | undefined, now = new Date()) {
  return active && Boolean(seen && seen.getTime() <= now.getTime() && seen.getTime() > now.getTime() - ONLINE_WINDOW_MS);
}
export function filterAndSortActivity<T extends { id: string; name: string; active: boolean; lastActivityAt: Date | null; online: boolean }>(rows: T[], view: ActivityView, now = new Date()) {
  const filtered = rows.filter(row => view === "unseen" ? !row.lastActivityAt : view === "inactive" ? Boolean(row.lastActivityAt && row.lastActivityAt.getTime() < now.getTime() - INACTIVE_WINDOW_MS) : true);
  return filtered.sort((a, b) => {
    if (view === "online" && a.online !== b.online) return Number(b.online) - Number(a.online);
    if (view === "inactive" && a.lastActivityAt && b.lastActivityAt) return a.lastActivityAt.getTime() - b.lastActivityAt.getTime() || a.name.localeCompare(b.name, "cs");
    return a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id);
  });
}
