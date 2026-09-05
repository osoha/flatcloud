import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, FileClock, LayoutTemplate } from "lucide-react";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { hasReportingBackofficeAccess, listReportingBackofficeGroups } from "@/lib/reporting/backoffice-access";

export const dynamic = "force-dynamic";

export default async function ShareholderReportsPage() {
  const user = await requireUser();
  if (!await hasReportingBackofficeAccess(user)) redirect("/reporty");
  const groups = await listReportingBackofficeGroups(user);
  const latest = groups.map((group) => group.latestReport).filter((report): report is NonNullable<typeof report> => Boolean(report)).sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter))[0];
  return <Shell user={user}><div className="page shareholder-reports-page">
    <div className="page-title"><div><h1>Akcionářské reporty</h1><p>Interní příprava, kontrola a publikace pravidelných výstupů pro akcionáře.</p><span className="scope-context-badge">Interní modul · oddělený od provozních reportů</span></div>{user.role === "SUPER_ADMIN" && <Link className="secondary" href="/reporty/sablony"><LayoutTemplate size={15}/> Šablony</Link>}</div>
    <div className="shareholder-report-grid">
      <Link className="card shareholder-report-card" href="/reporty/kvartalni"><span className="admin-module-icon"><CalendarRange/></span><div><span className="eyebrow">Aktivní workflow</span><h2>Kvartální reporty</h2><p>Reportovací skupiny, datové snapshoty, redakční kontrola a verzovaná publikace.</p><div className="shareholder-card-meta"><span>{groups.length} {groups.length === 1 ? "skupina" : "skupin"}</span><span>{latest ? `Poslední ${latest.year} Q${latest.quarter}` : "Zatím bez reportu"}</span></div><strong>Otevřít kvartální reporty →</strong></div></Link>
      <div className="card shareholder-report-card is-planned" aria-disabled="true"><span className="admin-module-icon"><FileClock/></span><div><span className="eyebrow">Další etapa R13</span><h2>Výroční reporty</h2><p>Historické srovnání, finanční vývoj, portfolio, distribuce a celoroční komentář.</p><div className="shareholder-card-meta"><span>Připravujeme</span><span>Bez neaktivního odkazu</span></div><strong>Dostupné po dokončení datové páteře</strong></div></div>
    </div>
  </div></Shell>;
}
