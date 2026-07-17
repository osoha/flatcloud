import Image from "next/image";
import Link from "next/link";
import { Building2, LayoutDashboard, LogOut, Plus, Settings, ShieldCheck, UserRound, Users, UsersRound } from "lucide-react";
import { canSeeAll, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { UserAvatar } from "@/components/UserAvatar";

type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  allProperties?: boolean;
  avatarMimeType?: string | null;
  updatedAt?: Date | string;
};

export async function Shell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const bankingMode = process.env.BANKING_PROVIDER === "mock" ? "Bankovní sandbox" : "Bankovní API";
  const superAdmin = user.role === "SUPER_ADMIN";
  const canAddProperty = canSeeAll(user.role);
  const canAddManualPayment = hasAllPropertyAccess(user) || Boolean(await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      _count: {
        select: {
          memberships: { where: { permission: { in: ["EDIT", "ADMIN"] } } },
          unitMemberships: { where: { permission: { in: ["EDIT", "ADMIN"] } } },
        },
      },
    },
  }).then((row) => row && (row._count.memberships > 0 || row._count.unitMemberships > 0)));

  return <div className="app-shell"><aside className="sidebar"><Link className="brand" href="/portfolio" aria-label="FlatCloud – domovská stránka"><Image src="/flatcloud-logo.png" width={178} height={43} alt="FlatCloud" priority/></Link><div className="scope-box"><small>Rozsah přístupu</small><strong>{hasAllPropertyAccess(user)?"Všechna portfolia":"Přiřazené objekty / jednotky"}</strong><span>Data oddělena podle oprávnění</span></div><nav className="nav"><Link href="/portfolio"><span className="ico"><LayoutDashboard size={17}/></span>Portfolio</Link><div className="nav-label">Správa</div><Link href="/portfolio"><span className="ico"><Building2 size={17}/></span>Nemovitosti</Link>{hasAllPropertyAccess(user)&&<Link href="/vlastnici"><span className="ico"><UsersRound size={17}/></span>Vlastníci / SVJ</Link>}{superAdmin&&<Link href="/uzivatele"><span className="ico"><Users size={17}/></span>Uživatelé</Link>}{superAdmin&&<Link href="/nastaveni"><span className="ico"><Settings size={17}/></span>Nastavení aplikace</Link>}<div className="nav-divider"/><Link href="/ucet"><span className="ico"><UserRound size={17}/></span>Můj účet</Link>{superAdmin&&<Link href="/nastaveni"><span className="ico"><ShieldCheck size={17}/></span>Audit a nastavení</Link>}</nav><div className="sidebar-user"><div className="user-card"><UserAvatar user={user}/><div><strong>{user.name}</strong><small>{user.email}</small><form className="logout-form" action="/api/auth/logout" method="post"><button><LogOut size={11} style={{display:"inline",marginRight:4}}/>Odhlásit</button></form></div></div></div></aside><main className="main"><header className="topbar"><div className="search">Hledat nemovitost, nájemníka nebo platbu…</div><div className="top-spacer"/><div className="top-actions">{canAddManualPayment&&<Link className="secondary top-action" href="/platby/nova"><Plus size={15}/><span>Ruční platba</span></Link>}{canAddProperty&&<Link className="primary top-action" href="/nemovitosti/nova"><Plus size={15}/><span>Přidat nemovitost</span></Link>}</div><span className="status ok banking-status">{bankingMode}</span></header>{children}</main></div>;
}
