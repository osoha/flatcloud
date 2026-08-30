import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Checkbox, Field, Flash, Textarea } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { hasReportingBackofficeAccess, listReportingBackofficeGroups } from "@/lib/reporting/backoffice-access";

export const dynamic = "force-dynamic";
const permissionLabels: Record<string, string> = { EDIT: "Příprava", ADMIN: "Administrace", SUPER_ADMIN: "Globální administrace" };
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };

export default async function QuarterlyReportingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser(); if (!await hasReportingBackofficeAccess(user)) redirect("/reporty");
  const [groups, query] = await Promise.all([listReportingBackofficeGroups(user), searchParams]);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Kvartální reporty</h1><p>Interní pracovní prostor reportovacích skupin a jejich kvartálních revizí.</p></div></div><Flash ok={query.ok} error={query.error}/>
    {user.role === "SUPER_ADMIN" && <details className="card"><summary><strong>Nová reportovací skupina</strong></summary><form className="compact-form" action="/api/reporting-groups" method="post"><Field label="Název" name="name" required/><Textarea label="Popis" name="description"/><Checkbox label="Aktivní skupina" name="active"/><button className="primary" type="submit">Vytvořit skupinu</button></form></details>}
    <div className="card portfolio-table-card" style={{ marginTop: 16 }}><div className="table-toolbar"><div><h2>Reportovací skupiny</h2><p>Zobrazeny jsou pouze skupiny, ve kterých připravujete reporty.</p></div></div><div className="table-wrap"><table><thead><tr><th>Skupina</th><th>Stav</th><th>Oprávnění</th><th>Nemovitosti</th><th>Poslední report</th><th></th></tr></thead><tbody>{groups.length ? groups.map((group) => <tr key={group.id}><td><strong>{group.name}</strong><span className="owner-sub">{group.description || "Bez popisu"}</span></td><td><span className={`status ${group.active ? "ok" : "bad"}`}>{group.active ? "Aktivní" : "Neaktivní"}</span></td><td>{permissionLabels[group.effectivePermission]}</td><td>{group.propertyCount}</td><td>{group.latestReport ? `${group.latestReport.year} Q${group.latestReport.quarter} · revize ${group.latestReport.revision} · ${statusLabels[group.latestReport.status]}` : "Zatím bez reportu"}</td><td><Link className="table-link" href={`/reporty/kvartalni/${group.id}`}>Otevřít</Link></td></tr>) : <tr><td colSpan={6} className="table-empty">Bez dostupných reportovacích skupin</td></tr>}</tbody></table></div></div>
  </div></Shell>;
}
