import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { businessDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canAdminReportingBackoffice, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { quarterSnapshotQualitySchema } from "@/lib/reporting/snapshot-schema";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };
type SnapshotMeta = { id: string; revision: number; source: string; schemaVersion: number; calculatorVersion: string; createdAt: Date; sourceNote: string | null; quality: unknown };

function QualitySummary({ quality }: { quality: unknown }) {
  const parsed = quarterSnapshotQualitySchema.safeParse(quality);
  if (!parsed.success) return <span className="muted-copy">Kvalitu dat se nepodařilo načíst.</span>;
  const counts = { INFO: 0, WARNING: 0, BLOCKER: 0 };
  for (const issue of parsed.data.issues) counts[issue.severity] += 1;
  return <span>INFO {counts.INFO} · WARNING {counts.WARNING} · BLOCKER {counts.BLOCKER}</span>;
}

function SnapshotDetails({ snapshot }: { snapshot: SnapshotMeta }) {
  return <div className="rule-summary"><div><strong>Snapshot revize {snapshot.revision}</strong><small>{snapshot.source} · schéma {snapshot.schemaVersion} · kalkulátor {snapshot.calculatorVersion}</small><small>Vytvořeno {snapshot.createdAt.toLocaleString("cs-CZ")}</small>{snapshot.sourceNote && <small>Poznámka ke zdroji: {snapshot.sourceNote}</small>}<small><QualitySummary quality={snapshot.quality}/></small></div></div>;
}

export default async function QuarterlyReportWorkspace({ params, searchParams }: { params: Promise<{ groupId: string; reportId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ groupId, reportId }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const report = await prisma.quarterlyReport.findFirst({
    where: { id: reportId, reportingGroupId: groupId },
    select: {
      id: true, year: true, quarter: true, revision: true, status: true, asOfDate: true,
      reportingGroup: { select: { id: true, name: true } },
      propertyReports: {
        select: {
          propertyId: true,
          property: { select: { name: true, address: true, active: true } },
          snapshot: { select: { id: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true } },
        },
        orderBy: { property: { name: "asc" } },
      },
    },
  });
  if (!report) notFound();

  const propertyIds = report.propertyReports.map((row) => row.propertyId);
  const candidates = report.status === "DRAFT" && propertyIds.length ? await prisma.quarterSnapshot.findMany({
    where: { propertyId: { in: propertyIds }, asOfDate: report.asOfDate, source: { in: ["CALCULATED", "MANUAL_BASELINE"] } },
    select: { id: true, propertyId: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true },
    orderBy: [{ propertyId: "asc" }, { revision: "desc" }],
  }) : [];
  const candidatesByProperty = new Map<string, typeof candidates>();
  for (const snapshot of candidates) candidatesByProperty.set(snapshot.propertyId, [...(candidatesByProperty.get(snapshot.propertyId) || []), snapshot]);
  const admin = canAdminReportingBackoffice(permission);
  const transitionAction = `/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/transition`;

  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href={`/reporty/kvartalni/${groupId}`}>← {report.reportingGroup.name}</Link></div><div className="page-title"><div><h1>{report.year} Q{report.quarter}</h1><p>{report.reportingGroup.name} · revize {report.revision} · rozhodné datum {businessDateKey(report.asOfDate)}</p><span className="status">{statusLabels[report.status]}</span></div></div><Flash ok={query.ok} error={query.error}/>
    {report.status === "DRAFT" && <div className="card"><form action={transitionAction} method="post"><button className="primary" name="action" value="submit-review">Odeslat ke kontrole</button></form></div>}
    {report.status === "REVIEW" && admin && <div className="card"><form action={transitionAction} method="post"><button className="secondary" name="action" value="return-draft">Vrátit do konceptu</button></form></div>}
    <div className="detail-grid" style={{ marginTop: 16 }}>{report.propertyReports.map((row) => {
      const propertyCandidates = candidatesByProperty.get(row.propertyId) || [];
      const base = `/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/properties/${row.propertyId}`;
      return <div className="card col-12" key={row.propertyId}><div className="table-toolbar"><div><h2>{row.property.name}</h2><p>{row.property.address} · {row.property.active ? "Aktivní" : "Neaktivní"}</p></div></div><SnapshotDetails snapshot={row.snapshot}/>
        {report.status === "DRAFT" && <div className="compact-form"><form className="compact-form" action={`${base}/snapshot`} method="post"><label className="field"><span>Uložený kompatibilní snapshot</span><select name="snapshotId" defaultValue={row.snapshot.id}>{propertyCandidates.map((snapshot) => <option value={snapshot.id} key={snapshot.id}>Revize {snapshot.revision} · {snapshot.source} · {snapshot.createdAt.toLocaleString("cs-CZ")}</option>)}</select></label><button className="secondary" type="submit">Použít snapshot</button></form><form action={`${base}/recalculate`} method="post"><button className="secondary" type="submit">Přepočítat snapshot</button></form></div>}
      </div>;
    })}</div>
  </div></Shell>;
}
