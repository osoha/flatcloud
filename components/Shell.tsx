import { DisplayPreferences } from "@/components/DisplayPreferences";
import { ReadOnlyPreview } from "@/components/admin/ReadOnlyPreview";
import { isFlatcloudMember } from "@/lib/user-context-policy";
import { ActiveTabVisibility } from "@/components/ActiveTabVisibility";
import Link from "next/link";
import { AlertTriangle, BarChart3, BookOpen, CalendarCheck2, CalendarRange, ClipboardCheck, Compass, FileText, Hammer, Handshake, Headphones, LayoutDashboard, Library, ListChecks, LogOut, Plus, ReceiptText, Search, Settings, UserRound, Users, UsersRound, WalletCards } from "lucide-react";
import { canSeeAll, hasAllPropertyAccess, previewContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openTaskStatuses } from "@/lib/operations";
import { addCalendarMonths, nextLeaseAnniversary } from "@/lib/lease-alerts";
import { UserAvatar } from "@/components/UserAvatar";
import { effectiveLeaseEnd, leaseStatusAt } from "@/lib/lease-lifecycle-core";
import { leaseAccessWhere } from "@/lib/access";
import { isLeaseExpiring } from "@/lib/lease-catalog";
import { userRoles } from "@/lib/labels";
import { hasReportingBackofficeAccess } from "@/lib/reporting/backoffice-access";
import { ScopeAwareLink } from "@/components/ScopeAwareLink";
import { NativeDetailsEscape } from "@/components/NativeDetailsEscape";
import { CollapsibleNavGroup } from "@/components/CollapsibleNavGroup";
import { SidebarCollapseToggle } from "@/components/SidebarCollapseToggle";
import { UserActivityHeartbeat } from "@/components/UserActivityHeartbeat";
import { AdminOperationsPanel } from "@/components/admin/AdminOperationsPanel";
import { loadAdminOperations } from "@/lib/admin-operations";

type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  allProperties?: boolean;
  flatcloudMember?: boolean;
  avatarMimeType?: string | null;
  updatedAt?: Date | string;
};

export async function Shell({ user: contentUser, children, taskPropertyId, taskLeaseId }: { user: ShellUser; children: React.ReactNode; taskPropertyId?: string; taskLeaseId?: string }) {
  const context = await previewContext();
  const preview = context.requested && Boolean(context.actor);
  const user = preview ? context.actor! : contentUser;
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
  const canSeeQuarterlyReports = await hasReportingBackofficeAccess(user);
  const operations = superAdmin ? await loadAdminOperations() : null;

  return <div className="app-shell v21-shell flatberry-shell">
    <NativeDetailsEscape/>
    <ActiveTabVisibility/>
    <UserActivityHeartbeat/>
    <a className="skip-link" href="#main-content">Přeskočit na hlavní obsah</a>
    <aside className="sidebar">
      <SidebarCollapseToggle/>
      <nav className="nav v21-nav">
        <div className="nav-label">Přehled</div>
        <Nav href="/portfolio" icon={<LayoutDashboard size={17}/>} label="Portfolio"/>
        <Nav href="/reporty" icon={<BarChart3 size={17}/>} label="Reporty"/>
        {canSeeQuarterlyReports && <Nav href="/reporty/akcionarske" icon={<CalendarRange size={17}/>} label="Akcionářské reporty"/>}
        {canAddProperty && isFlatcloudMember(user) && <><Nav href="/distribuce" icon={<Handshake size={17}/>} label="Distribuce"/><Nav href="/distribuce/zajemci" icon={<UsersRound size={17}/>} label="Zájemci"/></>}

        <CollapsibleNavGroup id="operations" label="Provoz" activeRoots={["/ukoly","/portfolio/kvalita","/revize"]} forceOpen={openTasks > 0 || dueRevisions > 0}>
          <Nav href="/ukoly" icon={<ListChecks size={17}/>} label="Úkoly" count={openTasks}/>
          <Nav href="/portfolio/kvalita" icon={<Hammer size={17}/>} label="Kvalita a CAPEX"/>
          <Nav href="/revize" icon={<ClipboardCheck size={17}/>} label="Revize" count={dueRevisions}/>
        </CollapsibleNavGroup>

        <CollapsibleNavGroup id="finance" label="Finance" activeRoots={["/platby","/reporty/predpisy","/reporty/saldo","/kauce"]} forceOpen={unmatchedCount > 0}>
          {superAdmin && <Nav href="/platby/nesparovane" icon={<AlertTriangle size={17}/>} label="Nespárované platby" count={unmatchedCount}/>}
          <Nav href="/reporty/predpisy" icon={<ReceiptText size={17}/>} label="Předpisy"/>
          <Nav href="/reporty/saldo" icon={<WalletCards size={17}/>} label="Dlužníci"/>
          <Nav href="/kauce" icon={<WalletCards size={17}/>} label="Kauce"/>
        </CollapsibleNavGroup>

        <CollapsibleNavGroup id="evidence" label="Evidence" activeRoots={["/najemnici", "/smlouvy", "/dokumenty", "/vlastnici"]} defaultOpen>
          <Nav href="/najemnici" icon={<Users size={17}/>} label="Nájemníci"/>
          <Nav href="/smlouvy" icon={<CalendarCheck2 size={17}/>} label="Smlouvy" count={leaseAlertCount}/>
          <Nav href="/dokumenty" icon={<FileText size={17}/>} label="Dokumenty"/>
          {fullAccess && <Nav href="/vlastnici" icon={<UsersRound size={17}/>} label="Vlastníci a SPV"/>}
        </CollapsibleNavGroup>

        <CollapsibleNavGroup id="support" label="Podpora práce" activeRoots={["/metodika"]}>
          <Nav href="/metodika?view=guides" activeQuery={{view:"guides"}} icon={<Compass size={17}/>} label="Průvodci"/>
          <Nav href="/metodika?view=chapters" activeQuery={{view:"chapters"}} icon={<BookOpen size={17}/>} label="Metodika"/>
          <Nav href="/metodika?view=glossary" activeQuery={{view:"glossary"}} icon={<Library size={17}/>} label="Slovník"/>
          <Nav href="/metodika?view=media" activeQuery={{view:"media"}} icon={<Headphones size={17}/>} label="Znalostní média"/>
        </CollapsibleNavGroup>

        {superAdmin && <CollapsibleNavGroup id="administration" label="Správa" activeRoots={["/uzivatele", "/nastaveni", "/dovednosti"]}>
          <Nav href="/uzivatele" icon={<Users size={17}/>} label="Uživatelé"/>
          <Nav href="/nastaveni" icon={<Settings size={17}/>} label="Administrace"/>
          <Nav href="/dovednosti" icon={<Compass size={17}/>} label="Dovednosti"/>
          {operations && <AdminOperationsPanel initial={operations}/>}
        </CollapsibleNavGroup>}
      </nav>
      <div className="sidebar-footer">
        <DisplayPreferences userId={user.id}/>
        <div className="user-card">
          <Link className="user-card-profile" href="/ucet" title="Můj účet"><UserAvatar user={user}/><div><strong>{user.name}</strong><small className="user-card-meta">{userRoles[user.role]||user.role}</small></div></Link>
          <form className="logout-form" action="/api/auth/logout" method="post"><button aria-label="Odhlásit" title="Odhlásit"><LogOut size={16}/></button></form>
        </div>
      </div>
    </aside>
    <main className={`main${preview ? " user-preview-main" : ""}`} id="main-content" tabIndex={-1}>
      {preview && <ReadOnlyPreview/>}
      {preview && <div className="user-preview-banner" role="region" aria-label="Pohled uživatele"><div><strong>{context.target ? `Pohled uživatele: ${context.target.name}` : "Náhled již není platný"}</strong><span>{context.target?.email} · pouze pro čtení · levé menu je administrátorské</span></div><form action="/api/admin/user-preview/exit" method="post"><button className="primary">Ukončit náhled</button></form></div>}
      <header className="topbar v21-topbar">
        <form className="search global-search" action="/hledat" method="get"><Search size={15}/><input name="q" aria-label="Hledat" placeholder="Hledat nemovitost, nájemníka, smlouvu, platbu nebo úkol…"/></form>
        <div className="top-spacer"/>
        <div className="top-actions">
          <DisplayPreferences userId={user.id} mobile/>
          {!preview && canAddManualPayment && <ScopeAwareLink className="secondary top-action" href={taskPropertyId ? `/platby/nova?properties=${encodeURIComponent(taskPropertyId)}` : "/platby/nova"}><Plus size={15}/><span>Ruční platba</span></ScopeAwareLink>}
          {!preview && canAddTask && <Link className="secondary top-action" href={`/ukoly/novy${taskPropertyId ? `?propertyId=${taskPropertyId}${taskLeaseId ? `&leaseId=${taskLeaseId}` : ""}` : ""}`}><Plus size={15}/><span>Nový úkol</span></Link>}
          {!preview && canAddProperty && <Link className="primary top-action" href="/nemovitosti/nova"><Plus size={15}/><span>Přidat nemovitost</span></Link>}
          <Link className="account-chip" href="/ucet" aria-label="Můj účet"><UserRound size={15}/><span>{context.target?.name || user.name}</span></Link>
        </div>
      </header>
      {children}
    </main>
  </div>;
}

function Nav({href,icon,label,count=0,activeQuery}:{href:string;icon:React.ReactNode;label:string;count?:number;activeQuery?:Record<string,string>}){
  return <ScopeAwareLink href={href} activeQuery={activeQuery} title={label} aria-label={label}><span className="ico">{icon}</span><span>{label}</span>{count>0&&<b className="nav-count">{count>99?"99+":count}</b>}</ScopeAwareLink>;
}
