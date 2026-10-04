import {tenantPortalStatus} from "@/lib/tenant-portal-access";
export function TenantPortalBadge({tenant}:{tenant:Parameters<typeof tenantPortalStatus>[0]}) {
  const status=tenantPortalStatus(tenant);
  return <span className={`portal-access-badge ${status.tone}`}><i aria-hidden="true"/>{status.label}</span>;
}
