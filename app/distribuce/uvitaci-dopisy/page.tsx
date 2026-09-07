import Link from "next/link";
import { redirect } from "next/navigation";
import { MailPlus, Send, UserCheck } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";
import { MethodologyCallout } from "@/components/MethodologyCallout";
import { canSeeAll, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date } from "@/lib/format";
import { dateInput } from "@/lib/forms";
import { welcomeLetterStatuses, type WelcomeLetterStatus } from "@/lib/distribution/welcome-letters";

export const dynamic = "force-dynamic";
export default async function WelcomeLettersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [user, query] = await Promise.all([requireUser(), searchParams]); if (!canSeeAll(user.role)) redirect("/portfolio");
  const [opportunities, letters] = await Promise.all([
    prisma.distributionOpportunity.findMany({ where: { stage: "WON", prospect: { active: true, email: { not: null } }, unit: { property: { active: true, flatcloudConsolidationBasisPoints: { gt: 0 } } } }, include: { prospect: true, unit: { include: { property: { include: { owner: true } } } }, welcomeLetters: { orderBy: { revision: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" } }),
    prisma.distributionWelcomeLetter.findMany({ include: { createdBy: { select: { name: true } }, attachments: { select: { documentId: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const candidates = opportunities.filter((item) => !item.welcomeLetters[0] || ["SENT", "ARCHIVED"].includes(item.welcomeLetters[0].status));
  const ready = letters.filter((letter) => letter.status === "READY").length, sent = letters.filter((letter) => letter.status === "SENT").length;
  return <Shell user={user}><div className="page distribution-welcome-page"><div className="breadcrumb"><Link href="/distribuce">Distribuce</Link><span>›</span><span>Uvítací dopisy</span></div><div className="page-title"><div><h1>Uvítací dopisy novým vlastníkům</h1><p>Postprodejní péče navázaná na uzavřený prodej, konkrétní jednotku, dům a prodávající SPV.</p><span className="scope-context-badge">Externí komunikace · ruční kontrola před odesláním</span></div><div className="action-row"><Link className="secondary" href="/distribuce/zajemci">CRM zájemců</Link><Link className="secondary" href="/distribuce">Zpět na Distribuci</Link></div></div><Flash ok={query.ok} error={query.error}/>
    <MethodologyCallout slug="uvitaci-dopis-vlastnikovi" compact/>
    <div className="notice"><strong>Žádné automatické odesílání podle katastru</strong><span>Datum nabytí určuje nejdřívější možné odeslání. Každý e-mail musí projít editací, kontrolním stavem a samostatným potvrzením konkrétního pracovníka.</span></div>
    <div className="stat-grid v21-stat-grid distribution-crm-kpis"><Stat label="Uzavřené prodeje k založení" value={String(candidates.length)} icon={<UserCheck/>}/><Stat label="Připraveno k odeslání" value={String(ready)} icon={<Send/>}/><Stat label="Odeslané dopisy" value={String(sent)} icon={<MailPlus/>}/></div>
    <details className="card create-panel welcome-create"><summary><MailPlus size={15}/> Založit uvítací dopis</summary>{candidates.length ? <form action="/api/distribution/welcome-letters" method="post" className="form-grid"><label className="field field-full"><span>Uzavřený prodej *</span><select name="opportunityId" required><option value="">Vyberte nového vlastníka a jednotku</option>{candidates.map((item) => <option value={item.id} key={item.id}>{item.prospect.name} · {item.unit.property.name} · {item.unit.label} · prodávající {item.unit.property.owner.name}</option>)}</select></label><label className="field"><span>Datum nabytí podle katastru *</span><input type="date" name="ownershipRegisteredAt" defaultValue={dateInput(new Date())} required/></label><button className="primary" type="submit">Vytvořit z FlatCloud šablony</button></form> : <p className="muted-copy">Není dostupný další uzavřený prodej s e-mailem kupujícího. Nejprve uzavřete příležitost v CRM.</p>}</details>
    <section className="card portfolio-table-card"><div className="card-head"><div><h2>Historie dopisů</h2><p className="muted-copy">Každá odeslaná revize zůstává uzamčená; případná oprava vznikne jako nová revize.</p></div></div><div className="table-wrap"><table><thead><tr><th>Nový vlastník</th><th>Dům / jednotka</th><th>Nabytí</th><th>Stav</th><th>Přílohy</th><th>Aktualizace</th><th></th></tr></thead><tbody>{letters.length ? letters.map((letter) => <tr key={letter.id}><td><strong>{letter.recipientNameSnapshot}</strong><span className="owner-sub">{letter.recipientEmail}</span></td><td><strong>{letter.propertyNameSnapshot} · {letter.unitLabelSnapshot}</strong><span className="owner-sub">{letter.sellerNameSnapshot}</span></td><td>{date(letter.ownershipRegisteredAt)}</td><td><span className={`status ${letter.status === "SENT" ? "ok" : letter.status === "READY" ? "warn" : ""}`}>{welcomeLetterStatuses[letter.status as WelcomeLetterStatus]}</span></td><td>{letter.attachments.length}</td><td>{date(letter.updatedAt)}<span className="owner-sub">{letter.createdBy.name}</span></td><td><Link className="table-link" href={`/distribuce/uvitaci-dopisy/${letter.id}`}>Otevřít</Link></td></tr>) : <tr><td className="table-empty" colSpan={7}>Zatím nebyl založen žádný uvítací dopis.</td></tr>}</tbody></table></div></section>
  </div></Shell>;
}
function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="card stat"><div className="stat-icon blue">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }
