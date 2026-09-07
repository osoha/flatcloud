import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { hasReportingBackofficeAccess, listReportingBackofficeGroups } from "@/lib/reporting/backoffice-access";

export const dynamic = "force-dynamic";
const permissionLabels: Record<string, string> = { EDIT: "Příprava", ADMIN: "Administrace", SUPER_ADMIN: "Globální administrace" };
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };

export default async function AnnualReportingPage() {
  const user = await requireUser();
  if (!await hasReportingBackofficeAccess(user)) redirect("/reporty");
  const groups = await listReportingBackofficeGroups(user);
  return <Shell user={user}><div className="page annual-report-list-page">
    <div className="breadcrumb"><Link href="/reporty/akcionarske">Akcionářské reporty</Link><span>›</span><span>Výroční reporty</span></div>
    <div className="page-title"><div><span className="annual-report-kicker">R13 · portfolio a hodnota</span><h1>Výroční reporty</h1><p>Samostatný korporátní výstup nad společnými reportingovými skupinami a zmrazenými daty nemovitostí.</p></div></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Reportovací skupiny</h2><p>Výroční editor používá stejné členství a oprávnění jako kvartální workflow.</p></div></div><div className="table-wrap"><table><thead><tr><th>Skupina</th><th>Stav</th><th>Oprávnění</th><th>Nemovitosti</th><th>Poslední report</th><th></th></tr></thead><tbody>{groups.length ? groups.map((group) => <tr key={group.id}><td><strong>{group.name}</strong><span className="owner-sub">{group.description || "Bez popisu"}</span></td><td><span className={`status ${group.active ? "ok" : "bad"}`}>{group.active ? "Aktivní" : "Neaktivní"}</span></td><td>{permissionLabels[group.effectivePermission]}</td><td>{group.propertyCount}</td><td>{group.latestAnnualReport ? `${group.latestAnnualReport.year} · revize ${group.latestAnnualReport.revision} · ${statusLabels[group.latestAnnualReport.status]}` : "Zatím bez reportu"}</td><td><Link className="table-link" href={`/reporty/vyrocni/${group.id}`}>Otevřít</Link></td></tr>) : <tr><td colSpan={6} className="table-empty">Bez dostupných reportovacích skupin</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
