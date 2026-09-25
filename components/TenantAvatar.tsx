import { illustrationStyle, suggestedIllustration, validIllustration } from "@/lib/illustration-library";

export function TenantAvatar({ tenant, className = "" }: { tenant: { id: string; name: string; type?: string; avatarChoice?: string | null; avatarMimeType?: string | null }; className?: string }) {
  if (tenant.type === "COMPANY") return <span className={`tenant-avatar ${className}`} aria-label="Společnost">⌂</span>;
  if (tenant.avatarMimeType) return <span className={`tenant-avatar ${className}`}><img src={`/api/tenants/${tenant.id}/avatar`} alt={`Avatar ${tenant.name}`}/></span>;
  const choice = validIllustration(tenant.avatarChoice, "person") ? tenant.avatarChoice : suggestedIllustration("person", tenant.id);
  return <span className={`tenant-avatar ${className}`} role="img" aria-label={`Ilustrace ${tenant.name}`} style={illustrationStyle(choice)}/>;
}
