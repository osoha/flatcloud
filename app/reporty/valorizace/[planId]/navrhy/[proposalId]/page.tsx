import Link from "next/link";
import { PropertyPermission } from "@prisma/client";
import { notFound } from "next/navigation";
import { Flash } from "@/components/FormUi";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { hasPropertyPermission } from "@/lib/management";
import { loadRentChangeProposal, rentChangeProposalStatuses } from "@/lib/reporting/rent-change-proposals";

export const dynamic = "force-dynamic";

export default async function RentChangeProposalPage({ params, searchParams }: { params: Promise<{ planId: string; proposalId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser(), { planId, proposalId } = await params, query = await searchParams;
  let proposal: Awaited<ReturnType<typeof loadRentChangeProposal>>;
  try { proposal = await loadRentChangeProposal(user, planId, proposalId); } catch { notFound(); }
  const canConfirm = proposal.status === "DRAFT" && await hasPropertyPermission(user, proposal.lease.unit.propertyId, PropertyPermission.EDIT);
  const difference = proposal.proposedRentCents - proposal.previousRentCents;
  return <Shell user={user}><div className="page rent-change-proposal-page">
    <div className="breadcrumb"><Link href={`/reporty/valorizace/${planId}`}>← Schválený plán</Link><span>›</span><span>Návrh změny nájemného</span></div>
    <div className="page-title"><div><span className="eyebrow">Druhý krok · právní a finanční kontrola</span><h1>Návrh změny nájemného</h1><p>{proposal.lease.unit.property.name} · {proposal.lease.unit.label} · {proposal.lease.tenant.name}</p></div><span className={`status ${proposal.status==="CONFIRMED"?"ok":"warn"}`}>{rentChangeProposalStatuses[proposal.status]}</span></div>
    <Flash ok={query.ok} error={query.error}/>
    <div className="notice asset-scope-note"><strong>Samostatná změna jedné smlouvy</strong><span>Potvrzení se týká pouze této smlouvy. Služby, kauce, délka nájmu ani ostatní jednotky ze scénáře se nemění.</span></div>
    <div className="card rent-change-review"><div className="card-head"><div><h2>Kontrola před potvrzením</h2><p className="muted-copy">Zdroj: {proposal.forecastPlanId} · vytvořil/a {proposal.createdBy.name} {date(proposal.createdAt)}</p></div></div><div className="rent-change-amounts"><span><small>Původní nájemné</small><strong>{money(proposal.previousRentCents)}</strong></span><b aria-hidden="true">→</b><span><small>Nové nájemné</small><strong>{money(proposal.proposedRentCents)}</strong><em>{difference>=0?"+ ":""}{money(difference)}</em></span></div><div className="summary-list"><div><span>Účinnost od</span><strong>{date(proposal.effectiveFrom)}</strong></div><div><span>Právní důvod</span><strong>{proposal.legalBasis}</strong></div><div><span>Poznámka</span><strong>{proposal.note||"—"}</strong></div><div><span>Zdrojový plán</span><strong><Link href={`/reporty/valorizace/${proposal.forecastPlanId}`}>Otevřít schválenou revizi</Link></strong></div></div>
      {canConfirm&&<form className="rent-change-confirm" action={`/api/rent-forecast-plans/${planId}/proposals/${proposal.id}/confirm`} method="post"><div className="legal-warning"><strong>Potvrzení provede skutečnou změnu</strong><span>Vznikne nová časová verze položky Nájemné. Budoucí neuhrazené předpisy od data účinnosti se přepočítají; uhrazené nebo ručně upravené předpisy změnu zablokují.</span></div><label className="checkbox-field"><input type="checkbox" name="confirm"/><span>Zkontroloval/a jsem částku, účinnost a právní důvod a chci změnu potvrdit.</span></label><button className="primary" type="submit">Potvrdit změnu nájemného</button></form>}
      {proposal.status==="CONFIRMED"&&<div className="notice compact-notice"><strong>Potvrzeno {proposal.confirmedAt?date(proposal.confirmedAt):""}</strong><span>Změnu potvrdil/a {proposal.confirmedBy?.name||"uživatel"}. Časová verze nájemného je evidována od {date(proposal.effectiveFrom)}.</span><Link className="secondary" href={`/smlouvy/${proposal.leaseId}`}>Otevřít smlouvu</Link></div>}
      {!canConfirm&&proposal.status==="DRAFT"&&<div className="notice compact-notice"><strong>Pouze ke čtení</strong><span>Potvrzení vyžaduje právo upravovat nemovitost.</span></div>}
    </div>
  </div></Shell>;
}
