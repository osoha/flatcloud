import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };

export default async function AnnualReportingGroupPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ groupId }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const group = await prisma.reportingGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, description: true, active: true, annualReports: { select: { id: true, year: true, revision: true, status: true, createdAt: true, _count: { select: { propertyReports: true } } }, orderBy: [{ year: "desc" }, { revision: "desc" }], take: 20 } },
  });
  if (!group) notFound();
  const defaultYear = new Date().getUTCFullYear();
  return <Shell user={user}><div className="page annual-report-group-page">
    <div className="breadcrumb"><Link href="/reporty/vyrocni">← Výroční reporty</Link></div>
    <div className="page-title"><div><span className="annual-report-kicker">Výroční reportovací skupina</span><h1>{group.name}</h1><p>{group.description || "Bez popisu"}</p></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <section className="card annual-report-create"><div><h2>Nový výroční report</h2><p>Rozhodným dnem je vždy 31. prosinec. Při založení se zmrazí Q4 snapshoty platných nemovitostí.</p></div>{group.active ? <form className="compact-form" action={`/api/reporting-groups/${group.id}/annual-reports`} method="post"><label className="field"><span>Rok</span><input type="number" name="year" defaultValue={defaultYear} min="2000" max="2200" required/></label><button className="primary" type="submit">Založit výroční report</button></form> : <p className="muted-copy">Skupina je neaktivní. Nový výroční report nelze založit.</p>}</section>
    <section className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Výroční revize</h2><p>Korporátní vrstva zůstává oddělená od kvartálních kapitol jednotlivých nemovitostí.</p></div></div><div className="table-wrap"><table><thead><tr><th>Rok</th><th>Revize</th><th>Stav</th><th>Nemovitosti</th><th>Vytvořeno</th></tr></thead><tbody>{group.annualReports.length ? group.annualReports.map((report) => <tr key={report.id}><td><Link className="table-link" href={`/reporty/vyrocni/${group.id}/reporty/${report.id}`}>{report.year}</Link></td><td>{report.revision}</td><td><span className="status">{statusLabels[report.status]}</span></td><td>{report._count.propertyReports}</td><td>{report.createdAt.toLocaleDateString("cs-CZ")}</td></tr>) : <tr><td colSpan={5} className="table-empty">Zatím bez výročních reportů</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}
