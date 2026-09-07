import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { requireUser } from "@/lib/auth";
import { businessDateKey } from "@/lib/calendar";
import { prisma } from "@/lib/db";
import { moneyInput } from "@/lib/forms";
import { backofficePermissionForGroup, canReadReportingBackoffice } from "@/lib/reporting/backoffice-access";

export const dynamic = "force-dynamic";
const statusLabels: Record<string, string> = { DRAFT: "Koncept", REVIEW: "Ke kontrole", PUBLISHED: "Publikováno" };
const money = (value: bigint | null) => moneyInput(value === null ? null : Number(value));
const displayMoney = (value: bigint | null) => value === null ? "—" : `${(Number(value) / 100).toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;

export default async function AnnualReportWorkspace({ params, searchParams }: { params: Promise<{ groupId: string; reportId: string }>; searchParams: Promise<{ section?: string; propertyId?: string; ok?: string; error?: string }> }) {
  const [{ groupId, reportId }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const permission = await backofficePermissionForGroup(user, groupId);
  if (!canReadReportingBackoffice(permission)) redirect("/reporty");
  const report = await prisma.annualReport.findFirst({
    where: { id: reportId, reportingGroupId: groupId },
    include: { propertyReports: { include: { snapshot: { select: { revision: true, source: true, schemaVersion: true, calculatorVersion: true, createdAt: true } } }, orderBy: { propertyNameSnapshot: "asc" } } },
  });
  if (!report) notFound();
  const section = ["overview", "property", "appendix"].includes(query.section || "") ? query.section! : "overview";
  const selectedProperty = report.propertyReports.find((row) => row.propertyId === query.propertyId) || report.propertyReports[0] || null;
  const editable = report.status === "DRAFT";
  const baseHref = `/reporty/vyrocni/${groupId}/reporty/${reportId}`;
  const completedProperties = report.propertyReports.filter((row) => row.currentValueCents !== null && row.targetValueCents !== null && row.investmentCase).length;
  return <Shell user={user}><div className="page annual-report-workspace-page">
    <div className="breadcrumb"><Link href={`/reporty/vyrocni/${groupId}`}>← {report.reportingGroupNameSnapshot}</Link><span>›</span><span>Výroční report {report.year}</span></div>
    <header className="annual-report-hero"><div><span>FlatCloud · Výroční report</span><h1>{report.year}</h1><p>{report.reportingGroupNameSnapshot} · revize {report.revision} · rozhodné datum {businessDateKey(report.asOfDate)}</p></div><div><span className="status">{statusLabels[report.status]}</span><strong>{completedProperties}/{report.propertyReports.length} kapitol připraveno</strong></div></header>
    <Flash ok={query.ok} error={query.error}/>
    <div className="annual-report-workspace-layout">
      <nav className="annual-report-nav" aria-label="Příprava výročního reportu">
        <Link className={section === "overview" ? "active" : ""} href={`${baseHref}?section=overview`}><strong>01 · Korporátní příběh</strong><small>Portfolio, hodnota a akcie</small></Link>
        <div className="annual-report-nav-group"><span>02 · Nemovitosti</span>{report.propertyReports.map((property) => <Link className={section === "property" && selectedProperty?.propertyId === property.propertyId ? "active" : ""} key={property.id} href={`${baseHref}?section=property&propertyId=${property.propertyId}`}><strong>{property.propertyNameSnapshot}</strong><small>{property.targetValueCents !== null && property.investmentCase ? "Kapitola připravena" : "Čeká na doplnění"}</small></Link>)}</div>
        <Link className={section === "appendix" ? "active" : ""} href={`${baseHref}?section=appendix`}><strong>03 · Příloha a zdroje</strong><small>Snapshoty a provenience</small></Link>
      </nav>
      <main>
        {section === "overview" && <div className="annual-report-editor-stack">
          <section className="card annual-report-editor-intro"><span className="annual-report-kicker">Korporátní a portfolio vrstva</span><h2>Příběh roku a vývoj hodnoty</h2><p>Výroční report není součtem kvartálních reportů. Zde vzniká investorský příběh, hodnota portfolia, exity a informace o akcii.</p></section>
          <form className="card annual-report-editor" action={`/api/reporting-groups/${groupId}/annual-reports/${reportId}/editorial`} method="post">
            <div className="annual-editor-section"><span className="annual-section-number">01</span><div><h3>Slovo zakladatele a shrnutí roku</h3><p className="muted-copy">Samostatná korporátní vrstva, která se nepřebírá z kvartálních komentářů.</p></div></div>
            <label className="field"><span>Slovo zakladatele</span><textarea name="founderLetter" rows={8} defaultValue={report.founderLetter || ""} disabled={!editable}/></label>
            <label className="field"><span>Manažerské shrnutí roku</span><textarea name="executiveSummary" rows={5} defaultValue={report.executiveSummary || ""} disabled={!editable}/></label>
            <div className="annual-editor-section"><span className="annual-section-number">02</span><div><h3>Portfolio, hodnota a akcie</h3><p className="muted-copy">Částky jsou redakční výroční údaje v Kč. Zdroj a rozhodné datum popište v komentáři.</p></div></div>
            <div className="annual-money-grid">
              <label className="field"><span>Hrubá hodnota aktiv Kč</span><input name="grossAssetValue" inputMode="decimal" defaultValue={money(report.grossAssetValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Čistá hodnota aktiv Kč</span><input name="netAssetValue" inputMode="decimal" defaultValue={money(report.netAssetValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Dluh Kč</span><input name="debt" inputMode="decimal" defaultValue={money(report.debtCents)} disabled={!editable}/></label>
              <label className="field"><span>Cílová hodnota portfolia Kč</span><input name="targetPortfolioValue" inputMode="decimal" defaultValue={money(report.targetPortfolioValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Výnosy z realizovaných exitů Kč</span><input name="realizedExitProceeds" inputMode="decimal" defaultValue={money(report.realizedExitProceedsCents)} disabled={!editable}/></label>
              <label className="field"><span>Plánované výnosy z exitů Kč</span><input name="plannedExitProceeds" inputMode="decimal" defaultValue={money(report.plannedExitProceedsCents)} disabled={!editable}/></label>
              <label className="field"><span>Vydané akcie</span><input type="number" min="0" name="issuedShares" defaultValue={report.issuedShares ?? ""} disabled={!editable}/></label>
              <label className="field"><span>Vlastní akcie</span><input type="number" min="0" name="treasuryShares" defaultValue={report.treasuryShares ?? ""} disabled={!editable}/></label>
              <label className="field"><span>Cena akcie Kč</span><input name="sharePrice" inputMode="decimal" defaultValue={money(report.sharePriceCents)} disabled={!editable}/></label>
            </div>
            <div className="annual-value-preview"><div><span>Čistá hodnota aktiv</span><strong>{displayMoney(report.netAssetValueCents)}</strong></div><div><span>Cílová hodnota portfolia</span><strong>{displayMoney(report.targetPortfolioValueCents)}</strong></div><div><span>Cena akcie</span><strong>{displayMoney(report.sharePriceCents)}</strong></div></div>
            <label className="field"><span>Investiční teze</span><textarea name="investmentThesis" rows={5} defaultValue={report.investmentThesis || ""} disabled={!editable}/></label>
            <label className="field"><span>Jak se v roce tvořila hodnota</span><textarea name="valueCreationSummary" rows={5} defaultValue={report.valueCreationSummary || ""} disabled={!editable}/></label>
            <label className="field"><span>Výhled dalšího období</span><textarea name="outlook" rows={5} defaultValue={report.outlook || ""} disabled={!editable}/></label>
            {editable ? <button className="primary" type="submit">Uložit korporátní a portfolio vrstvu</button> : <p className="muted-copy">Publikovaný nebo kontrolovaný report je pouze ke čtení.</p>}
          </form>
        </div>}
        {section === "property" && selectedProperty && <div className="annual-report-editor-stack">
          <section className="card annual-property-heading"><span className="annual-report-kicker">Kapitola nemovitosti</span><h2>{selectedProperty.propertyNameSnapshot}</h2><p>{selectedProperty.propertyAddressSnapshot}</p><div className="annual-property-source"><span>Zmrazený Q4 snapshot</span><strong>revize {selectedProperty.snapshot.revision}</strong><small>{selectedProperty.snapshot.source} · schema {selectedProperty.snapshot.schemaVersion} · kalkulátor {selectedProperty.snapshot.calculatorVersion}</small></div></section>
          <form className="card annual-report-editor" action={`/api/reporting-groups/${groupId}/annual-reports/${reportId}/properties/${selectedProperty.propertyId}`} method="post">
            <div className="annual-editor-section"><span className="annual-section-number">02</span><div><h3>Hodnota a exit nemovitosti</h3><p className="muted-copy">Roční redakční hodnoty jsou oddělené od provozního snapshotu a mají vlastní poznámku ke zdroji.</p></div></div>
            <div className="annual-money-grid">
              <label className="field"><span>Hodnota na začátku roku Kč</span><input name="openingValue" inputMode="decimal" defaultValue={money(selectedProperty.openingValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Hodnota ke konci roku Kč</span><input name="currentValue" inputMode="decimal" defaultValue={money(selectedProperty.currentValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Cílová hodnota Kč</span><input name="targetValue" inputMode="decimal" defaultValue={money(selectedProperty.targetValueCents)} disabled={!editable}/></label>
              <label className="field"><span>Realizované výnosy z exitu Kč</span><input name="realizedExitProceeds" inputMode="decimal" defaultValue={money(selectedProperty.realizedExitProceedsCents)} disabled={!editable}/></label>
              <label className="field"><span>Plánované výnosy z exitu Kč</span><input name="plannedExitProceeds" inputMode="decimal" defaultValue={money(selectedProperty.plannedExitProceedsCents)} disabled={!editable}/></label>
              <label className="field"><span>Plánovaný rok exitu</span><input type="number" min="2000" max="2200" name="plannedExitYear" defaultValue={selectedProperty.plannedExitYear ?? ""} disabled={!editable}/></label>
            </div>
            <label className="field"><span>Investiční případ</span><textarea name="investmentCase" rows={5} defaultValue={selectedProperty.investmentCase || ""} disabled={!editable}/></label>
            <label className="field"><span>Tvorba hodnoty v roce</span><textarea name="valueCreationNarrative" rows={5} defaultValue={selectedProperty.valueCreationNarrative || ""} disabled={!editable}/></label>
            <label className="field"><span>Výhled a další milníky</span><textarea name="outlook" rows={5} defaultValue={selectedProperty.outlook || ""} disabled={!editable}/></label>
            <label className="field"><span>Poznámka ke zdrojům hodnot</span><textarea name="sourceNote" rows={3} defaultValue={selectedProperty.sourceNote || ""} disabled={!editable}/></label>
            {editable && <button className="primary" type="submit">Uložit kapitolu nemovitosti</button>}
          </form>
        </div>}
        {section === "appendix" && <div className="annual-report-editor-stack"><section className="card"><span className="annual-report-kicker">Příloha a provenience</span><h2>Zmrazené zdroje reportu</h2><p className="muted-copy">Každá nemovitost používá společný kvartální snapshot k 31. prosinci. Výroční redakční pole jsou uložena odděleně a publikace je v této etapě ještě nedostupná.</p></section><section className="card portfolio-table-card"><div className="table-wrap"><table><thead><tr><th>Nemovitost</th><th>Snapshot</th><th>Zdroj</th><th>Kalkulátor</th><th>Vytvořeno</th></tr></thead><tbody>{report.propertyReports.map((property) => <tr key={property.id}><td><strong>{property.propertyNameSnapshot}</strong><span className="owner-sub">{property.propertyAddressSnapshot}</span></td><td>Q4 · revize {property.snapshot.revision}</td><td>{property.snapshot.source}</td><td>{property.snapshot.calculatorVersion}</td><td>{property.snapshot.createdAt.toLocaleDateString("cs-CZ")}</td></tr>)}</tbody></table></div></section></div>}
      </main>
    </div>
  </div></Shell>;
}
