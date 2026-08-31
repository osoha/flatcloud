import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { QuarterlyPropertyEditorialEditor } from "@/components/QuarterlyPropertyEditorialEditor";
import { requireUser } from "@/lib/auth";
import { businessDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { backofficePermissionForGroup, canAdminReportingBackoffice, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";
import { technicalSectionsSchema, valuationRowsSchema, valuationTotalCents, type TechnicalSection, type ValuationRow } from "@/lib/reporting/editorial-schema";
import { quarterSnapshotQualitySchema } from "@/lib/reporting/snapshot-schema";
import { quarterlyReportQualityGate } from "@/lib/reporting/quarterly-quality-gate";
import { fileStorageCapabilities } from "@/lib/storage";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };
const propertyStatusLabels: Record<string, string> = { STABILIZED: "Stabilizovaná", RENOVATION: "Rekonstrukce", DEVELOPMENT: "Development", EXIT: "Exit / prodej" };
const technicalStatusLabels: Record<string, string> = { OK: "V pořádku", WATCH: "Sledovat", ACTION: "Vyžaduje akci", RISK: "Riziko" };
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

function PropertyEditorialReadOnly({ propertyStatus, managementCommentary, technicalSections, valuationRows }: { propertyStatus: string | null; managementCommentary: string | null; technicalSections: TechnicalSection[] | null; valuationRows: ValuationRow[] | null }) {
  const money = (cents: number) => `${(cents / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
  const unitRows = valuationRows?.filter((row) => "kind" in row) ?? [];
  const legacyRows = valuationRows?.filter((row) => !("kind" in row)) ?? [];
  return <div style={{ marginBottom: 16 }}><p><strong>Stav projektu:</strong> {propertyStatus ? propertyStatusLabels[propertyStatus] : "Nevyplněno"}</p><h3>Komentář managementu</h3><p className="muted-copy" style={{ whiteSpace: "pre-wrap" }}>{managementCommentary || "Bez komentáře"}</p><h3>Technické oblasti</h3>{technicalSections === null ? <p className="muted-copy">Technické oblasti se nepodařilo načíst.</p> : technicalSections.length ? technicalSections.map((section, index) => <div className="rule-summary" key={index}><div><strong>{section.title}</strong><small>{section.status ? technicalStatusLabels[section.status] : "Bez stavu"}</small><small style={{ whiteSpace: "pre-wrap" }}>{section.commentary || "Bez komentáře"}</small></div></div>) : <p className="muted-copy">Bez technických oblastí</p>}<h3>Ocenění</h3>{valuationRows === null ? <p className="muted-copy">Řádky ocenění se nepodařilo načíst.</p> : valuationRows.length ? <>{unitRows.map((row, index) => "kind" in row && <div className="rule-summary" key={index}><div><strong>{row.unitLabel}</strong><small>{row.disposition || "—"} · {row.floor || "—"} · {row.areaM2 == null ? "—" : `${row.areaM2.toLocaleString("cs-CZ")} m²`}</small><small>{money(row.amountCents)}</small></div></div>)}{legacyRows.length > 0 && <><h4>Starší formát ocenění</h4>{legacyRows.map((row, index) => !("kind" in row) && <div className="rule-summary" key={index}><div><strong>{row.label}</strong><small>{row.amountCents != null ? money(row.amountCents) : row.valueLabel}</small>{row.note && <small>{row.note}</small>}</div></div>)}</>}<p><strong>Celkové ocenění: {money(valuationTotalCents(valuationRows))}</strong></p></> : <p className="muted-copy">Bez řádků ocenění</p>}</div>;
}

export default async function QuarterlyReportWorkspace({ params, searchParams }: { params: Promise<{ groupId: string; reportId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ groupId, reportId }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const report = await prisma.quarterlyReport.findFirst({
    where: { id: reportId, reportingGroupId: groupId },
    select: {
      id: true, year: true, quarter: true, revision: true, status: true, asOfDate: true, executiveSummary: true, publishedAssetId: true,
      reportingGroup: { select: { id: true, name: true } },
      propertyReports: {
        select: {
          propertyId: true, propertyStatus: true, managementCommentary: true, technicalSections: true, valuationRows: true,
          property: { select: { name: true, address: true, active: true } },
          snapshot: { select: { id: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true } },
        },
        orderBy: { property: { name: "asc" } },
      },
    },
  });
  if (!report) notFound();

  const qualityGate = quarterlyReportQualityGate(
    report.propertyReports.map((row) => ({
      propertyId: row.propertyId,
      quality: row.snapshot.quality,
    })),
  );

  const reviewStarted =
    report.status === "REVIEW"
      ? await prisma.auditLog.findFirst({
          where: {
            entityType: "QuarterlyReport",
            entityId: report.id,
            action: "REPORT_SUBMITTED_REVIEW",
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null;

  const warningAcknowledgement =
    report.status === "REVIEW" &&
    reviewStarted &&
    qualityGate.warningCount > 0
      ? await prisma.auditLog.findFirst({
          where: {
            entityType: "QuarterlyReport",
            entityId: report.id,
            action: "REPORT_WARNINGS_ACKNOWLEDGED",
            createdAt: { gte: reviewStarted.createdAt },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null;

  const warningsAcknowledged =
    qualityGate.warningCount === 0 || Boolean(warningAcknowledgement);

  const propertyNames = new Map(
    report.propertyReports.map((row) => [
      row.propertyId,
      row.property.name,
    ]),
  );

  const propertyIds = report.propertyReports.map((row) => row.propertyId);
  const candidates = report.status === "DRAFT" && propertyIds.length ? await prisma.quarterSnapshot.findMany({
    where: { propertyId: { in: propertyIds }, asOfDate: report.asOfDate, source: { in: ["CALCULATED", "MANUAL_BASELINE"] } },
    select: { id: true, propertyId: true, revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true, sourceNote: true, quality: true },
    orderBy: [{ propertyId: "asc" }, { revision: "desc" }],
  }) : [];
  const candidatesByProperty = new Map<string, typeof candidates>();
  for (const snapshot of candidates) candidatesByProperty.set(snapshot.propertyId, [...(candidatesByProperty.get(snapshot.propertyId) || []), snapshot]);
  const admin = canAdminReportingBackoffice(permission);
  const persistentStorageAvailable = fileStorageCapabilities().persistentWrites;
  const transitionAction = `/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/transition`;

  return <Shell user={user}><div className="page"><div className="breadcrumb"><Link href={`/reporty/kvartalni/${groupId}`}>← {report.reportingGroup.name}</Link></div><div className="page-title"><div><h1>{report.year} Q{report.quarter}</h1><p>{report.reportingGroup.name} · revize {report.revision} · rozhodné datum {businessDateKey(report.asOfDate)}</p><span className="status">{statusLabels[report.status]}</span></div></div><Flash ok={query.ok} error={query.error}/>
    <div className="card"><h2>Výkonné shrnutí</h2>{report.status === "DRAFT" ? <form className="edit-form" action={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/editorial`} method="post"><label className="field field-full"><span>Shrnutí za celou reportovací skupinu</span><textarea name="executiveSummary" defaultValue={report.executiveSummary || ""} maxLength={10000}/></label><div className="form-actions"><button className="primary" type="submit">Uložit shrnutí</button></div></form> : <p className="muted-copy" style={{ whiteSpace: "pre-wrap" }}>{report.executiveSummary || "Bez výkonného shrnutí"}</p>}</div>
    <div className="card">
      <h2>Kontrola kvality před publikací</h2>
      <p>
        <strong>
          INFO {qualityGate.infoCount} · WARNING {qualityGate.warningCount} · BLOCKER {qualityGate.blockerCount}
        </strong>
      </p>

      {qualityGate.invalidQualityCount > 0 && (
        <p className="muted-copy">
          U {qualityGate.invalidQualityCount} snapshotů se metadata kvality nepodařilo ověřit; publikace je blokována.
        </p>
      )}

      {qualityGate.issues.length ? (
        <ul>
          {qualityGate.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.propertyId || "all"}-${index}`}>
              <strong>{issue.severity}</strong> · {propertyNames.get(issue.propertyId || "") || "Report"} · {issue.message}
            </li>
          ))}
        </ul>
      ) : qualityGate.invalidQualityCount === 0 ? (
        <p className="muted-copy">Bez problémů kvality dat.</p>
      ) : null}

      {report.status === "REVIEW" && qualityGate.warningCount > 0 && (
        <p className="muted-copy">
          {warningsAcknowledged
            ? "Warningy byly potvrzeny pro aktuální kontrolní cyklus."
            : "Warningy musí před publikací potvrdit administrátor."}
        </p>
      )}

      {report.status === "REVIEW" &&
        admin &&
        qualityGate.blockerCount === 0 &&
        qualityGate.warningCount > 0 &&
        !warningsAcknowledged && (
          <form action={transitionAction} method="post">
            <button
              className="secondary"
              name="action"
              value="acknowledge-warnings"
            >
              Potvrdit warningy
            </button>
          </form>
        )}

      {report.status === "REVIEW" &&
        admin &&
        qualityGate.blockerCount === 0 &&
        warningsAcknowledged && (
          <form
            action={transitionAction}
            method="post"
            style={{ marginTop: 8 }}
          >
            <button className="primary" name="action" value="publish">
              Publikovat
            </button>
          </form>
        )}
    </div>

    {report.status === "DRAFT" && (
      <div className="card">
        <form action={transitionAction} method="post">
          <button className="primary" name="action" value="submit-review">
            Odeslat ke kontrole
          </button>
        </form>
      </div>
    )}

    {report.status === "REVIEW" && admin && (
      <div className="card">
        <form action={transitionAction} method="post">
          <button className="secondary" name="action" value="return-draft">
            Vrátit do konceptu
          </button>
        </form>
      </div>
    )}

    {report.status === "PUBLISHED" && (
      <div className="card">
        <h2>Publikovaný soubor</h2>
        <p><a className="button secondary" href={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/assets/preview`}>Stáhnout náhled PDF</a></p>
        {report.publishedAssetId ? <a className="button secondary" href={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/assets/download`}>Stáhnout PDF</a> : admin && persistentStorageAvailable ? <form action={`/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/assets/generate`} method="post"><button className="primary" type="submit">Vygenerovat PDF</button></form> : admin ? <p className="muted-copy">Trvalé úložiště souborů není nakonfigurováno. Pro kontrolu vzhledu použijte náhled PDF.</p> : <p className="muted-copy">PDF zatím nebylo vygenerováno.</p>}
        <form action={transitionAction} method="post">
          <button
            className="secondary"
            name="action"
            value="create-correction"
          >
            Vytvořit opravnou revizi
          </button>
        </form>
      </div>
    )}
    <div className="detail-grid" style={{ marginTop: 16 }}>{report.propertyReports.map((row) => {
      const propertyCandidates = candidatesByProperty.get(row.propertyId) || [];
      const base = `/api/reporting-groups/${groupId}/quarterly-reports/${reportId}/properties/${row.propertyId}`;
      const technical = technicalSectionsSchema.safeParse(row.technicalSections ?? []);
      const valuations = valuationRowsSchema.safeParse(row.valuationRows ?? []);
      return <div className="card col-12" key={row.propertyId}><div className="table-toolbar"><div><h2>{row.property.name}</h2><p>{row.property.address} · {row.property.active ? "Aktivní" : "Neaktivní"}</p></div></div><SnapshotDetails snapshot={row.snapshot}/>
        {report.status === "DRAFT" ? <QuarterlyPropertyEditorialEditor action={`${base}/content`} propertyStatus={row.propertyStatus} managementCommentary={row.managementCommentary} initialTechnicalSections={technical.success ? technical.data : []} initialValuationRows={valuations.success ? valuations.data : []}/> : <PropertyEditorialReadOnly propertyStatus={row.propertyStatus} managementCommentary={row.managementCommentary} technicalSections={technical.success ? technical.data : null} valuationRows={valuations.success ? valuations.data : null}/>}
        {report.status === "DRAFT" && <div className="compact-form"><form className="compact-form" action={`${base}/snapshot`} method="post"><label className="field"><span>Uložený kompatibilní snapshot</span><select name="snapshotId" defaultValue={row.snapshot.id}>{propertyCandidates.map((snapshot) => <option value={snapshot.id} key={snapshot.id}>Revize {snapshot.revision} · {snapshot.source} · {snapshot.createdAt.toLocaleString("cs-CZ")}</option>)}</select></label><button className="secondary" type="submit">Použít snapshot</button></form><form action={`${base}/recalculate`} method="post"><button className="secondary" type="submit">Přepočítat snapshot</button></form></div>}
      </div>;
    })}</div>
  </div></Shell>;
}
