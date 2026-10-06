import "@/app/portal/tenant-portal.css";
import Link from "next/link";
import { TenantPortalNav } from "./TenantPortalNav";
import { Shell } from "./Shell";
import { leaseContractPilotEnabled } from "@/lib/lease-contract/pilot";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarChoice?: string | null;
};
export function TenantPortalFrame({
  user,
  children,
  preview = false,
  portalHref = "/portal/najemnik",
  accountHref = "/portal/najemnik/ucet",
}: {
  user: User;
  children: React.ReactNode;
  preview?: boolean;
  portalHref?: string;
  accountHref?: string;
}) {
  if (user.role !== "TENANT" && !preview)
    return <Shell user={user}>{children}</Shell>;
  return (
    <div className="tenant-portal-v2">
      <a className="tp-skip" href="#prehled">
        Přejít na obsah
      </a>
      <header className="tp-topbar">
        <Link href={portalHref} className="tp-brand" aria-label="FlatBerry">
          <span className="flatberry-brand-bitmap" aria-hidden="true" />
        </Link>
        <span className="tp-topbar-context">
          {preview
            ? "Náhled portálu · pouze pro čtení"
            : "Váš nájemnický portál"}
        </span>
        {preview ? (
          <Link className="tp-back" href={portalHref}>
            Zpět do náhledu
          </Link>
        ) : (
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="tp-text-button">
              Odhlásit se
            </button>
          </form>
        )}
      </header>
      <div className="tp-shell">
        <TenantPortalNav
          canAct={false}
          portalHref={portalHref}
          accountHref={accountHref}
          user={{id:user.id,name:user.name,avatarChoice:user.avatarChoice}}
          preview={preview}
          actions={leaseContractPilotEnabled()}
        />
        <main className="tp-main tp-account-main" id="prehled">
          {children}
        </main>
      </div>
    </div>
  );
}
