import Link from "next/link";
import { AlertCircle, ArrowRight, Bell, CheckCircle2, House, ListChecks, WalletCards } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { TenantAvatar } from "@/components/TenantAvatar";
import { PortfolioScopePicker } from "@/components/PortfolioScopePicker";
import { currentLeaseForUnit } from "@/lib/lease-lifecycle-core";
import { money } from "@/lib/format";
import { paidCents, overdueDebtCents } from "@/lib/charges";
import type { accessibleProperties } from "@/lib/access";
import type { EntityPhotos } from "@/lib/entity-photos";
import type { PortfolioSelection } from "@/lib/portfolio-selection";

type Property = Awaited<ReturnType<typeof accessibleProperties>>[number];
type PropertyRow = { property: Property; expected: number; paid: number; debt: number };
type ScopeOption = { id: string; name: string; address: string; city: string; active: boolean; ownerId: string; ownerName: string; scopeKind?: "FLATCLOUD" | "EXTERNAL" | "UNCLASSIFIED" };

export function BasicPortfolio({ name, period, rows, photos, expected, paid, debt, taskCount, attention, announcementCount, scopeOptions, selection }: {
  name: string; period: string; rows: PropertyRow[]; photos: EntityPhotos;
  expected: number; paid: number; debt: number; taskCount: number;
  attention: { title: string; detail: string; href: string; tone: "bad" | "warn" | "info" }[];
  announcementCount: number; scopeOptions: ScopeOption[]; selection: PortfolioSelection;
}) {
  const activeRows = rows.filter((row) => row.property.active);
  const units = activeRows.flatMap((row) => row.property.units);
  const occupied = units.filter((unit) => currentLeaseForUnit(unit.leases)).length;
  const remaining = Math.max(0, expected - paid);
  const firstName = name.trim().split(/\s+/)[0] || "vás";
  const month = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(new Date(`${period}-01T12:00:00Z`));

  return <div className="page basic-portfolio" data-guide="portfolio">
    <section className="basic-hero">
      <div className="basic-hero-copy"><span className="basic-eyebrow">Váš domovský přehled</span><h1>Dobrý den, {firstName}!</h1><p>Tady je to nejdůležitější z vašich nemovitostí. Podrobnosti jsou vždy na jedno kliknutí.</p><div className="basic-scope"><PortfolioScopePicker availableProperties={scopeOptions} selection={selection}/></div></div>
      <div className="basic-berry-note"><img className="basic-berry" src="/landing/berry-guide.webp" alt="" aria-hidden="true"/><div><strong>Berryho přehled</strong><p>{debt > 0 ? "Některé platby už jsou po splatnosti." : remaining > 0 ? "Část plateb za tento měsíc ještě zbývá uhradit." : "Vaše platby jsou pro tento měsíc uhrazené."}</p><Link href="/reporty?view=collections">Otevřít platby <ArrowRight size={16}/></Link></div></div>
    </section>

    <div className="basic-summary" aria-label="Souhrn portfolia">
      <Link href="#nemovitosti" className="basic-summary-card basic-homes"><span className="basic-summary-main"><span className="basic-summary-icon"><House size={38}/></span><span className="basic-summary-body"><span className="basic-summary-title">Nájmy a lidé</span><strong>{occupied} <span>z {units.length}</span></strong><small>{units.length ? "obsazených jednotek" : "zatím bez jednotek"}</small></span></span><span className="basic-summary-link">Moje nemovitosti <ArrowRight size={17}/></span></Link>
      <Link href="/reporty?view=collections" className="basic-summary-card basic-payments"><span className="basic-summary-main"><span className="basic-summary-icon"><WalletCards size={38}/></span><span className="basic-summary-body"><span className="basic-summary-title">Platby · {month}</span><strong>{money(paid)}</strong><small>uhrazeno z {money(expected)}</small></span></span><span className="basic-progress" role="img" aria-label={`Uhrazeno ${expected ? Math.round(paid / expected * 100) : 0} procent`}><span style={{ width: `${expected ? Math.max(0, Math.min(100, Math.round(paid / expected * 100))) : 0}%` }}/></span><small className="basic-payment-remaining">Za tento měsíc zbývá {money(remaining)}</small>{debt > 0 && <span className="basic-overdue-chip"><AlertCircle size={19}/><span>Po splatnosti celkem <strong>{money(debt)}</strong></span></span>}<span className="basic-summary-link">Přehled plateb <ArrowRight size={17}/></span></Link>
      <Link href="/ukoly" className="basic-summary-card basic-tasks"><span className="basic-summary-main"><span className="basic-summary-icon"><ListChecks size={38}/></span><span className="basic-summary-body"><span className="basic-summary-title">Úkoly a termíny</span><strong>{taskCount}</strong><small>{taskCount === 1 ? "otevřený úkol" : "otevřených úkolů"}</small></span></span><span className="basic-summary-link">Otevřít úkoly <ArrowRight size={17}/></span></Link>
    </div>

    <section className="basic-attention" aria-labelledby="basic-attention-heading">
      <div className="basic-section-heading"><div><span className="basic-eyebrow">Na čem záleží</span><h2 id="basic-attention-heading">Co teď potřebuje pozornost</h2></div><Link href="/ukoly">Všechny úkoly <ArrowRight size={16}/></Link></div>
      <div className="basic-attention-grid">
        {debt > 0 && <Link className="basic-attention-item basic-debt-alert" href="/reporty?view=collections"><span className="basic-attention-icon"><AlertCircle size={27}/></span><span><strong>Po splatnosti celkem <em>{money(debt)}</em></strong><small>Dluhy za všechna období · otevřít platby</small></span><ArrowRight size={19}/></Link>}
        {taskCount > 0 && attention.length === 0 && <Link className="basic-attention-item basic-task-alert" href="/ukoly"><span className="basic-attention-icon"><ListChecks size={26}/></span><span><strong>{taskCount} {taskCount === 1 ? "otevřený úkol" : "otevřených úkolů"}</strong><small>Otevřít přehled úkolů</small></span><ArrowRight size={19}/></Link>}
        {announcementCount > 0 && <Link className="basic-attention-item" href="/ukoly/oznameni"><span className="basic-attention-icon"><Bell size={21}/></span><span><strong>Oznámení ({announcementCount})</strong><small>Přečíst zprávy pro vás</small></span><ArrowRight size={18}/></Link>}
        {attention.slice(0, debt > 0 || taskCount > 0 ? 2 : announcementCount > 0 ? 2 : 3).map((item, index) => <Link className={`basic-attention-item basic-${item.tone}`} href={item.href} key={`${item.href}-${index}`}><span className="basic-attention-icon"><Bell size={21}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={18}/></Link>)}
        {!announcementCount && !attention.length && !taskCount && !debt && <div className="basic-attention-item basic-calm"><span className="basic-attention-icon"><CheckCircle2 size={22}/></span><span><strong>Vše je v pořádku</strong><small>Nic právě nevyžaduje vaši pozornost.</small></span></div>}
      </div>
    </section>

    <section className="basic-properties" id="nemovitosti" data-guide="properties" aria-labelledby="basic-properties-heading"><div className="basic-section-heading"><div><span className="basic-eyebrow">Moje místo</span><h2 id="basic-properties-heading">Nemovitosti</h2></div></div>
      <div className="basic-property-grid">{activeRows.flatMap(({ property }) => property.units.length ? property.units.map((unit) => {
        const lease = currentLeaseForUnit(unit.leases);
        const charges = unit.leases.flatMap((item) => item.charges);
        const due = charges.filter((charge) => charge.active && charge.period === period);
        const unitExpected = due.reduce((sum, charge) => sum + charge.amountCents, 0);
        const unitPaid = due.reduce((sum, charge) => sum + paidCents(charge), 0);
        const unitDebt = charges.reduce((sum, charge) => sum + overdueDebtCents(charge), 0);
        const href = `/nemovitosti/${property.id}/jednotky/${unit.id}`;
        return <article className="basic-property-card" key={unit.id}><Link className="basic-property-photo" href={href} aria-label={`Otevřít ${unit.label}`}><EntityAvatar photoId={photos.units[unit.id]} kind="unit" identity={unit.id} basic size="lg"/></Link>
          <div className="basic-property-body"><Link href={href} className="basic-property-name">{unit.label} <span className={`basic-unit-state${lease ? " is-occupied" : ""}`}>{lease ? "Pronajato" : "Volná"}</span></Link><p>{property.name} · {property.city}</p>
            <div className="basic-tenant">{lease ? <TenantAvatar tenant={lease.tenant} className="basic-person-avatar"/> : <span className="basic-person-avatar" aria-hidden="true">–</span>}<strong>{lease?.tenant.name || "Zatím bez nájemníka"}</strong></div>
            <div className="basic-rent"><span>{unitExpected ? <><strong>{money(unitExpected)}</strong> / {month}</> : "Bez předpisu v tomto měsíci"}</span>{unitDebt > 0 ? <b className="basic-payment-late">Po splatnosti {money(unitDebt)}</b> : unitExpected > 0 ? <b className={unitPaid >= unitExpected ? "basic-payment-ok" : "basic-payment-pending"}>{unitPaid >= unitExpected ? "Uhrazeno" : `Zbývá ${money(Math.max(0, unitExpected - unitPaid))}`}</b> : null}</div>
          </div></article>;
      }) : [<article className="basic-property-card" key={property.id}><Link className="basic-property-photo" href={`/nemovitosti/${property.id}/prehled`} aria-label={`Otevřít ${property.name}`}><EntityAvatar photoId={photos.properties[property.id]} identity={property.id} basic size="lg"/></Link><div className="basic-property-body"><Link href={`/nemovitosti/${property.id}/prehled`} className="basic-property-name">{property.name} <ArrowRight size={17}/></Link><p>{property.address}, {property.city}</p><small>Zatím bez jednotek</small></div></article>])}{!activeRows.length && <div className="basic-empty-properties"><House size={30}/><strong>Zatím tu nejsou žádné aktivní nemovitosti.</strong><span>Vyberte jiné portfolio nebo otevřete profesionální přehled.</span></div>}</div>
    </section>
  </div>;
}
