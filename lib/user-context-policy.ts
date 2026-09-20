export const PREVIEW_COOKIE = "fb_user_preview";
export const PREVIEW_DURATION_SECONDS = 1800;
export function isFlatcloudMember(user: { role: string; flatcloudMember?: boolean }) {
  return user.role === "SUPER_ADMIN" || user.flatcloudMember === true;
}
export function isCorporatePath(path: string) {
  return ["/distribuce", "/api/distribution", "/reporty/akcionarske", "/reporty/kvartalni", "/api/reporting-groups", "/api/report-design-templates", "/nastaveni/reporting"].some(root => path === root || path.startsWith(root + "/"));
}
export function isPreviewControl(path: string) {
  return ["/api/admin/user-preview", "/api/admin/user-preview/exit", "/api/account/activity", "/api/auth/logout"].includes(path);
}
export function previewRequestAllowed(method: string, path: string) {
  return ["GET", "HEAD", "OPTIONS"].includes(method) || (method === "POST" && isPreviewControl(path));
}
