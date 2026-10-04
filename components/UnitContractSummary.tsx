import type { ReactNode } from "react";
import Link from "next/link";
import type { Owner, OwnerBankAccount } from "@prisma/client";
import type { requireUnitAccess } from "@/lib/access";
import { date, money, phone } from "@/lib/format";
import { effectiveLeaseEnd } from "@/lib/lease-lifecycle-core";
import { ownerBankAccountLabel } from "@/lib/owner-bank-account";
import { rentRollAmountsAt } from "@/lib/reporting/rent-roll";
import { securityDepositSnapshot } from "@/lib/security-deposit";

type Unit = NonNullable<Awaited<ReturnType<typeof requireUnitAccess>>>;
type Lease = Unit["leases"][number];
export function UnitContractSummary({ lease, unit, owner, propertyName, canManage, paymentAccount, partyNames }: {
  lease: Lease; unit: Unit; owner: Owner; propertyName: string; canManage: boolean;
  paymentAccount: OwnerBankAccount | null; partyNames: string[];
}) {
  const end = effectiveLeaseEnd(lease);
  const amounts = rentRollAmountsAt({ ...lease, charges: [], financialTrackingFromPeriod: undefined }, new Date());
  const deposit = securityDepositSnapshot(lease);
  const email = lease.tenant.type === "COMPANY" ? lease.tenant.communicationEmail || lease.tenant.billingEmail || lease.tenant.email : lease.tenant.email;
  return <section id="smlouva" className="card unit-module-card unit-contract-summary">
    <div className="card-head"><div><h2>Nájemní smlouva</h2><p className="muted-copy">{lease.terminatedOn ? `Aktivní do konce dne ${date(lease.terminatedOn)}` : "Aktivní smlouva"}</p></div><div className="action-row"><Link className="secondary" href={`/smlouvy/${lease.id}`}>Otevřít smlouvu</Link>{canManage&&<Link className="secondary" href={`/smlouvy/${lease.id}#dokumenty`}>Nahrát smlouvu nebo dodatek</Link>}{canManage&&<Link className="secondary" href={`/nemovitosti/${unit.propertyId}/smlouvy/${lease.id}/upravit`}>Upravit smlouvu</Link>}</div></div>
    <div className="unit-contract-group"><h3>Smluvní strany</h3><div className="unit-contract-parties"><div><span>Vlastník jednotky</span><Link href={`/vlastnici/${owner.id}`}>{owner.name} ↗</Link>{owner.ico&&<small>IČO {owner.ico}</small>}</div><div><span>Nájemce</span><Link href={`/najemnici/${lease.tenantId}`}>{partyNames.join(" + ")} ↗</Link>{lease.tenant.ico&&<small>IČO {lease.tenant.ico}</small>}<div className="unit-contract-contact">{email&&<a href={`mailto:${email}`}>{email}</a>}{lease.tenant.phone&&<a href={`tel:${lease.tenant.phone}`}>{phone(lease.tenant.phone)}</a>}</div></div></div></div>
    <div className="unit-contract-group"><h3>Prostor a platnost smlouvy</h3><dl className="unit-contract-fields">
      <Field label="Nemovitost / jednotka">{propertyName} · {unit.label}</Field><Field label="Podlaží / výměra">{unit.floor || "—"} · {unit.areaM2 ? `${unit.areaM2.toLocaleString("cs-CZ")} m²` : "—"}</Field>
      <Field label="Číslo smlouvy">{lease.contractNumber || "Bez čísla"}</Field><Field label="Doba smlouvy">{lease.endDate ? "Na dobu určitou" : "Na dobu neurčitou"}</Field>
      <Field label="Počátek nájmu">{date(lease.startDate)}</Field><Field label="Ukončení nájmu">{end ? date(end) : "Na dobu neurčitou"}</Field>
      {lease.terminatedOn&&<Field label="Důvod ukončení">{lease.terminationReason || "—"}</Field>}
    </dl></div>
    <div className="unit-contract-group"><h3>Nájemné a platební podmínky</h3><div className="unit-contract-amounts"><div><span>Čisté nájemné</span><strong>{money(amounts.rent.amountCents)}</strong></div><div><span>Zálohy na služby</span><strong>{money(amounts.services.amountCents)}</strong></div><div><span>Celkem měsíčně</span><strong>{money(amounts.rent.amountCents + amounts.services.amountCents)}</strong></div></div><dl className="unit-contract-fields">
      <Field label="Splatnost nájemného">{lease.dueDay}. den · {lease.rentTiming === "ARREARS" ? "zpětně" : "dopředně"}</Field><Field label="Variabilní symbol">{lease.variableSymbol}</Field>
      <Field label="Platební účet vlastníka">{paymentAccount ? <Link href={`/nemovitosti/${unit.propertyId}/banka#ucet-${paymentAccount.id}`}>{ownerBankAccountLabel(paymentAccount)} ↗</Link> : "Není nastaven"}</Field><Field label="Finanční evidence od">{lease.financialTrackingFromPeriod}</Field>
      <Field label="Účet nájemníka">{lease.tenantBankAccount || "Neuveden"}</Field><Field label="Automatické předpisy">{lease.autoChargesEnabled ? "Zapnuté" : "Vypnuté"}</Field>
    </dl></div>
    <div className="unit-contract-group"><h3>Kauce a důležitá ujednání</h3><dl className="unit-contract-fields"><Field label="Sjednaná kauce">{money(deposit.agreedAmountCents)}</Field><Field label="Skutečně drženo"><Link href={`/smlouvy/${lease.id}#kauce`}>{money(deposit.heldPrincipalCents)} · detail kauce ↗</Link></Field></dl>{lease.note&&<div className="unit-contract-note"><span>Poznámka / ujednání</span><p>{lease.note}</p></div>}</div>
  </section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <div><dt>{label}</dt><dd>{children}</dd></div>; }
