import { FinancialTrendChart } from "@/components/FinancialTrendChart";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { hasAllPropertyAccess, requireUser } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { confirmedLoanState, loanRateTypes, percentFromBasisPoints } from "@/lib/asset-finance";
import { businessDateKey, businessTodayKey } from "@/lib/calendar";
import { date, moneyExact } from "@/lib/format";

export const dynamic = "force-dynamic";
const reviewLabels = { DRAFT: "Rozpracováno", READY_FOR_ACCOUNTANT: "Připraveno pro účetní", CONFIRMED_BY_ACCOUNTANT: "Potvrzeno účetní", EXCLUDED: "Vyřazeno z ročních podkladů" };

export default async function LoanDetail({ params }: { params: Promise<{ id: string; loanId: string }> }) {
  const user = await requireUser();
  const { id, loanId } = await params;
  const property = await requirePropertyAccess(user, id);
  if (!property || (!hasAllPropertyAccess(user) && !property.memberships.some(row => row.userId === user.id))) notFound();
  const loan = await prisma.propertyLoan.findFirst({ where: { id: loanId, propertyId: id }, include: { snapshots: { orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] }, annualEvidence: { orderBy: { year: "desc" }, include: { reviewedBy: { select: { name: true } } } } } });
  if (!loan) notFound();
  const current = confirmedLoanState(loan);
  const events = await prisma.auditLog.findMany({ where: { propertyId: id, action: "PROPERTY_LOAN_SNAPSHOT_CREATED", entityType: "PropertyLoanSnapshot", entityId: { in: loan.snapshots.map(row => row.id) } }, include: { user: { select: { name: true } } } });
  const today = businessTodayKey();
  const chartRows = [...loan.snapshots].reverse().filter(row => businessDateKey(row.asOfDate) <= today);
  const financeUrl = `/nemovitosti/${id}/finance#uvery`;
  return <Shell user={user} taskPropertyId={id}><div className="page">
    <div className="breadcrumb"><Link href={financeUrl}>{property.name} · Finance</Link><span>›</span><span>Úvěr</span></div>
    <div className="page-title"><div><h1>{loan.label}</h1><p>{loan.lender} · {loan.active ? "Aktivní" : "Ukončený"} · {loanRateTypes[loan.rateType]}</p></div><Link className="secondary" href={financeUrl}>Zpět na finance</Link></div>
    <PropertySubnav propertyId={id} active="finance" unitLimited={false}/>
    <section className="card" aria-label="Potvrzený stav úvěru"><h2>Potvrzený stav úvěru</h2><p>Poslední evidovaný stav k dnešku. Potvrzení stavu není potvrzením bankovní úhrady ani účetního nákladu.</p>
      <div className="summary-list"><div><span>Původní jistina</span><strong>{moneyExact(Number(loan.principalCents))}</strong></div><div><span>Stav ke dni</span><strong>{current.confirmedAsOfDate ? date(current.confirmedAsOfDate) : "Chybí datovaný stav"}</strong></div><div><span>Zbývající jistina</span><strong>{current.confirmedAsOfDate ? moneyExact(Number(current.outstandingPrincipalCents)) : "Nedoloženo"}</strong></div><div><span>Roční sazba</span><strong>{current.confirmedAsOfDate ? percentFromBasisPoints(current.annualInterestRateBps) : "Nedoloženo"}</strong></div><div><span>Měsíční dluhová služba</span><strong>{current.confirmedAsOfDate && current.monthlyDebtServiceCents != null ? moneyExact(Number(current.monthlyDebtServiceCents)) : "Neuvedeno"}</strong></div></div>
      <p>Jistina je zůstatek dluhu. Dluhová služba je evidovaná splátka zahrnující jistinu a úrok; sama neurčuje daňově uznatelný úrok. Rozdíl dvou zůstatků nemusí znamenat zaplacenou splátku.</p>
      <h3>Poznámka / zdroj úvěru</h3><p style={{ whiteSpace: "pre-wrap" }}>{loan.note || "Zdroj nebyl uveden."}</p>
    </section>
    <section className="card" aria-label="Termíny financování"><h2>Termíny financování</h2><div className="summary-list">{[["Konec fixace", loan.fixedUntil], ["Splatnost úvěru", loan.maturityDate]].map(([label, value]) => { const deadline = value as Date | null; return <div key={String(label)}><span>{String(label)}</span><strong>{deadline ? `${date(deadline)}${businessDateKey(deadline) < today ? " · Po termínu" : ""}` : label === "Konec fixace" && loan.rateType === "FLOATING" ? "Pohyblivá sazba" : "Neuvedeno"}</strong></div>; })}</div></section>
    <section className="card"><h2>Vývoj financování</h2><p>Grafy zobrazují pouze nebudoucí evidované stavy; mezi záznamy nejde o potvrzení splátek. Chybějící údaj o splátce je mezera.</p><FinancialTrendChart title="Historie jistiny úvěru" rows={chartRows.map(row=>({label:businessDateKey(row.asOfDate),values:[Number(row.outstandingPrincipalCents)]}))} series={[{label:"Zbývající jistina",color:"#1769e0"}]}/><FinancialTrendChart title="Historie měsíční dluhové služby" rows={chartRows.map(row=>({label:businessDateKey(row.asOfDate),values:[row.monthlyDebtServiceCents == null ? null : Number(row.monthlyDebtServiceCents)]}))} series={[{label:"Měsíční dluhová služba",color:"#2f9f72"}]}/></section>
    <section className="card" aria-label="Historie stavů úvěru"><h2>Historie stavů úvěru</h2><p>Historie zůstává dostupná i po ukončení úvěru nebo archivaci nemovitosti. Budoucí záznamy nevstupují do potvrzeného stavu.</p><div className="table-wrap" role="region" aria-label="Historie stavů; tabulku lze posouvat" tabIndex={0}><table><thead><tr>{["Stav ke dni", "Jistina", "Sazba", "Měsíční dluhová služba", "Zdroj / poznámka", "Zaznamenal", "Zapsáno"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{loan.snapshots.map(row => <tr key={row.id}><th scope="row">{date(row.asOfDate)}{businessDateKey(row.asOfDate) > today && " · Budoucí plán"}</th><td>{moneyExact(Number(row.outstandingPrincipalCents))}</td><td>{percentFromBasisPoints(row.annualInterestRateBps)}</td><td>{row.monthlyDebtServiceCents == null ? "Neuvedeno" : moneyExact(Number(row.monthlyDebtServiceCents))}</td><td>{row.note || "Bez uvedeného zdroje"}</td><td>{events.find(event => event.entityId === row.id)?.user?.name || "Autor není v auditu doložen"}</td><td>{row.createdAt.toLocaleString("cs-CZ")}</td></tr>)}</tbody></table></div>{!loan.snapshots.length && <p>Zatím není evidovaný datovaný stav.</p>}</section>
    <section className="card" aria-label="Roční evidence úroků"><h2>Roční evidence úroků</h2><p>Úroky vycházejí ze samostatných ročních podkladů a jejich účetního ověření. Neodvozují se násobením měsíční splátky.</p>{loan.annualEvidence.length ? <div className="summary-list">{loan.annualEvidence.map(row => <div key={row.id}><span><Link href={`/reporty/rocni-podklady?ownerId=${property.ownerId}&year=${row.year}#loan-${loan.id}`}>{row.year} · Otevřít roční podklady</Link><br/>{reviewLabels[row.reviewStatus]}{row.reviewedBy && ` · ${row.reviewedBy.name}`}{row.reviewedAt && ` · ${date(row.reviewedAt)}`}</span><strong>{moneyExact(Number(row.interestPaidCents))}</strong></div>)}</div> : <p>Roční evidence úroků zatím chybí.</p>}</section>
  </div></Shell>;
}
