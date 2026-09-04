import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, BarChart3, BookOpen, Building2, CalendarCheck2, CalendarRange, ClipboardCheck, FileText, LayoutDashboard, ListChecks, LogOut, Plus, ReceiptText, Search, Settings, UserRound, Users, UsersRound, WalletCards } from "lucide-react";
import { canSeeAll, hasAllPropertyAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openTaskStatuses } from "@/lib/operations";
import { addCalendarMonths, nextLeaseAnniversary } from "@/lib/lease-alerts";
import { UserAvatar } from "@/components/UserAvatar";
import { effectiveLeaseEnd, leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseAccessWhere } from "@/lib/access";
import { isLeaseExpiring } from "@/lib/lease-catalog";
import { userRoles } from "@/lib/labels";
import { authorizationScopeLabel } from "@/lib/access-scope-label";
import { hasReportingBackofficeAccess } from "@/lib/reporting/backoffice-access";

type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  allProperties?: boolean;
  avatarMimeType?: string | null;
  updatedAt?: Date | string;
};

export async function Shell({ user, children, taskPropertyId, taskLeaseId }: { user: ShellUser; children: React.ReactNode; taskPropertyId?: string; taskLeaseId?: string }) {
  const superAdmin = user.role === "SUPER_ADMIN";
  const fullAccess = hasAllPropertyAccess(user);
  const canAddProperty = canSeeAll(user.role);
  const taskWhere = fullAccess ? {} : { OR: [{ property: { memberships: { some: { userId: user.id } } } }, { unit: { userAccesses: { some: { userId: user.id } } } }] };
  const revisionWhere = fullAccess ? {} : { property: { memberships: { some: { userId: user.id } } } };
  const revisionHorizon = new Date(Date.now() + 60 * 86_400_000);
  const [openTasks, dueRevisions, unmatchedCount, leaseRows] = await Promise.all([
    prisma.task.count({ where: { ...taskWhere, status: { in: openTaskStatuses } } }),
    prisma.complianceItem.count({ where: { ...revisionWhere, active: true, nextDueAt: { lte: revisionHorizon } } }),
    superAdmin ? Promise.all([
      prisma.bankTransaction.count({ where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] } } }),
      prisma.inboxPayment.count({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] } } }),
    ]).then((values) => values.reduce((sum, value) => sum + value, 0)) : Promise.resolve(0),
    prisma.lease.findMany({ where: leaseAccessWhere(user), select: { startDate: true, endDate: true, terminatedOn: true, cancelledAt: true } }),
  ]);
  const today = new Date();
  const leaseHorizon = addCalendarMonths(today, 3);
  const leaseAlertCount = leaseRows.reduce((count, lease) => {
    if (leaseStatusAt(lease, today) !== "ACTIVE") return count;
    const end = effectiveLeaseEnd(lease);
    const expiry = isLeaseExpiring(lease, today) ? 1 : 0;
    const anniversary = nextLeaseAnniversary(lease.startDate, today);
    const anniversaryHit = anniversary <= leaseHorizon && (!end || anniversary <= end) ? 1 : 0;
    return count + expiry + anniversaryHit;
  }, 0);
  const canAddTask = fullAccess || Boolean(await prisma.userProperty.count({ where: { userId: user.id, permission: { in: ["EDIT", "ADMIN"] } } }));
  const canAddManualPayment = fullAccess || Boolean(await prisma.user.findUnique({
    where: { id: user.id },
    select: { _count: { select: { memberships: { where: { permission: { in: ["EDIT", "ADMIN"] } } }, unitMemberships: { where: { permission: { in: ["EDIT", "ADMIN"] } } } } } },
  }).then((row) => row && (row._count.memberships > 0 || row._count.unitMemberships > 0)));
  const accessPropertyIds=fullAccess?[]:(await Promise.all([
    prisma.userProperty.findMany({where:{userId:user.id},select:{propertyId:true}}),
    prisma.userUnit.findMany({where:{userId:user.id},select:{unit:{select:{propertyId:true}}}}),
  ])).flatMap((rows,index)=>index===0?(rows as Array<{propertyId:string}>).map(row=>row.propertyId):(rows as Array<{unit:{propertyId:string}}>).map(row=>row.unit.propertyId));
  const accessLabel=authorizationScopeLabel(fullAccess,accessPropertyIds);
  const canSeeQuarterlyReports = await hasReportingBackofficeAccess(user);

  return <div className="app-shell v21-shell">
    <aside className="sidebar">
      <Link className="brand" href="/portfolio" aria-label="FlatCloud – domovská stránka">
        <Image src="/flatcloud-logo-white.png" width={148} height={36} alt="FlatCloud" priority/>
      </Link>
      <nav className="nav v21-nav">
        <div className="nav-label">Přehled</div>
        <Nav href="/portfolio" icon={<LayoutDashboard size={17}/>} label="Portfolio"/>
        <Nav href="/reporty" icon={<BarChart3 size={17}/>} label="Reporty"/>
        {canSeeQuarterlyReports && <Nav href="/reporty/kvartalni" icon={<CalendarRange size={17}/>} label="Kvartální reporty"/>}
        {canAddProperty && <Nav href="/distribuce" icon={<Building2 size={17}/>} label="Kategorizace"/>}

        <div className="nav-label">Provoz</div>
        <Nav href="/ukoly" icon={<ListChecks size={17}/>} label="Úkoly" count={openTasks}/>
        <Nav href="/revize" icon={<ClipboardCheck size={17}/>} label="Revize" count={dueRevisions}/>

        <div className="nav-label">Finance</div>
        {superAdmin && <Nav href="/platby/nesparovane" icon={<AlertTriangle size={17}/>} label="Nespárované platby" count={unmatchedCount}/>} 
        <Nav href="/reporty/predpisy" icon={<ReceiptText size={17}/>} label="Předpisy"/>
        <Nav href="/reporty/saldo" icon={<WalletCards size={17}/>} label="Dlužníci"/>
        <Nav href="/kauce" icon={<WalletCards size={17}/>} label="Kauce"/>

        <div className="nav-label">Evidence</div>
        <Nav href="/najemnici" icon={<Users size={17}/>} label="Nájemníci"/>
        <Nav href="/smlouvy" icon={<CalendarCheck2 size={17}/>} label="Smlouvy" count={leaseAlertCount}/>
        <Nav href="/dokumenty" icon={<FileText size={17}/>} label="Dokumenty"/>
        {fullAccess && <Nav href="/vlastnici" icon={<UsersRound size={17}/>} label="Vlastníci a SPV"/>}

        <div className="nav-label">Podpora práce</div>
        <Nav href="/metodika" icon={<BookOpen size={17}/>} label="Metodika"/>

        <div className="nav-label">Správa</div>
        {superAdmin && <Nav href="/uzivatele" icon={<Users size={17}/>} label="Uživatelé"/>}
        {superAdmin && <Nav href="/nastaveni" icon={<Settings size={17}/>} label="Administrace"/>}
      </nav>
      <div className="sidebar-footer">
        <div className="user-card">
          <Link className="user-card-profile" href="/ucet"><UserAvatar user={user}/><div><strong>{user.name}</strong><small className="user-card-email">{user.email}</small><small className="user-card-meta">{userRoles[user.role]||user.role} · {accessLabel}</small></div></Link>
          <form className="logout-form" action="/api/auth/logout" method="post"><button aria-label="Odhlásit"><LogOut size={13}/></button></form>
        </div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar v21-topbar">
        <form className="search global-search" action="/hledat" method="get"><Search size={15}/><input name="q" aria-label="Hledat" placeholder="Hledat nemovitost, nájemníka, smlouvu, platbu nebo úkol…"/></form>
        <div className="top-spacer"/>
        <div className="top-actions">
          {canAddManualPayment && <Link className="secondary top-action" href="/platby/nova"><Plus size={15}/><span>Ruční platba</span></Link>}
          {canAddTask && <Link className="secondary top-action" href={`/ukoly/novy${taskPropertyId ? `?propertyId=${taskPropertyId}${taskLeaseId ? `&leaseId=${taskLeaseId}` : ""}` : ""}`}><Plus size={15}/><span>Nový úkol</span></Link>}
          {canAddProperty && <Link className="primary top-action" href="/nemovitosti/nova"><Plus size={15}/><span>Přidat nemovitost</span></Link>}
          <Link className="account-chip" href="/ucet"><UserRound size={15}/><span>{user.name}</span></Link>
        </div>
      </header>
      {children}
    </main>
  </div>;
}

function Nav({href,icon,label,count=0}:{href:string;icon:React.ReactNode;label:string;count?:number}){
  return <Link href={href}><span className="ico">{icon}</span><span>{label}</span>{count>0&&<b className="nav-count">{count>99?"99+":count}</b>}</Link>;
}
