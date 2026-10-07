import Link from "next/link";
import {LockKeyhole} from "lucide-react";
import {TenantPortalNav} from "@/components/TenantPortalNav";
import "@/app/portal/tenant-portal.css";

/** The shared account forms, inside the tenant's own navigation. */
export function TenantAccountShell({children, accountPage = true}: {children: React.ReactNode; accountPage?: boolean}) {
  return <div className="tenant-portal-v2 tenant-account">
    <a className="tp-skip" href="#main-content">Přejít na obsah</a>
    <header className="tp-topbar">
      <Link href="/portal/najemnik" className="tp-brand" aria-label="FlatBerry"><span className="flatberry-brand-bitmap" aria-hidden="true"/></Link>
      <span className="tp-topbar-context"><LockKeyhole size={14}/> Váš nájemnický portál</span>
      <form action="/api/auth/logout" method="post"><button type="submit" className="tp-text-button">Odhlásit se</button></form>
    </header>
    <div className="tp-shell"><TenantPortalNav canAct={false} accountPage={accountPage}/><main className="tp-main" id="main-content" tabIndex={-1}>{children}</main></div>
  </div>;
}
