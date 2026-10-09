import { applyDueBankAccountChanges } from "@/lib/bank-account-changes";
import { portalBankNotices } from "@/lib/portal-bank-notices";
import { PortalBankNotice } from "@/components/tenant-portal/PortalBankNotice";
import "../../tenant-portal.css";
import {randomUUID} from "node:crypto";
import Link from "next/link";
import Image from "next/image";
import {notFound, redirect} from "next/navigation";
import {ArrowLeft, ArrowRight, CalendarDays, Camera, Check, CheckCircle2, ChevronRight, CreditCard, Download, Droplets, FileCheck2, FileText, House, Info, LockKeyhole, Mail, MessageCircle, Phone, ShieldCheck, Wrench} from "lucide-react";
import {TenantPortalNav} from "@/components/TenantPortalNav";
import {TenantPortalMessages} from "@/components/TenantPortalMessages";
import {UserAvatar} from "@/components/UserAvatar";
import {EntityAvatar} from "@/components/EntityAvatar";
import {RentPaymentQr} from "@/components/RentPaymentQr";
import {Flash} from "@/components/FormUi";
import {PortalConversations} from "@/components/tenant-portal/PortalConversations";
import {PortalContactChange} from "@/components/tenant-portal/PortalContactChange";
import {PortalPanel} from "@/components/tenant-portal/PortalPanel";
import {PortalCopy} from "@/components/tenant-portal/PortalCopy";
import {PortalReceiptPicker} from "@/components/tenant-portal/PortalReceiptPicker";
import {PortalPaymentHistory, type PortalPaymentRow} from "@/components/tenant-portal/PortalPaymentHistory";
import {greeting} from "@/lib/greeting";
import {periodLabel, currentPeriod} from "@/lib/period";
import {isPastDue, outstandingCents} from "@/lib/charges";
import {tenantPortalPaymentState} from "@/lib/tenant-portal-payment-state";
import {receiptEligible, receiptIssuerStatusForLease} from "@/lib/tenant-payment-receipts";
import {actualUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
import {moneyExact, date, phone} from "@/lib/format";
import {defaultPropertyIllustration} from "@/lib/illustration-library";
import {domesticAccountLabel, formatIban} from "@/lib/owner-bank-account";
import {businessTodayKey, businessDateKey} from "@/lib/calendar";
import {hasTenantPortalAccess, manageableTenantLeaseIds} from "@/lib/tenant-portal-access";
import {tenantSharedDocumentWhere} from "@/lib/documents/tenant-visibility";
import {documentCategories, meterTypes, taskStatuses, unitDispositions, unitTypes} from "@/lib/labels";
import {currentReadings} from "@/lib/meter-reading-rules";
import {portalContactPropertyInclude, portalContactOwnerSelect, tenantPortalContact} from "@/lib/tenant-portal-contact";

export const dynamic = "force-dynamic";

export default async function TenantPortal({params, searchParams}: {
  params: Promise<{tenantId: string}>;
  searchParams: Promise<{ok?: string; error?: string}>;
}) {
  const actor = await actualUser();
  const {tenantId} = await params;
  if (!actor) redirect(`/login?portal=${encodeURIComponent(tenantId)}`);
  const tenantAccess = await hasTenantPortalAccess(actor.id, actor.email, tenantId);
  const manageableIds = tenantAccess ? [] : await manageableTenantLeaseIds(actor, tenantId);
  if (!tenantAccess && !manageableIds.length) notFound();
  const preview = !tenantAccess;
  const tenant = await prisma.tenant.findUnique({where: {id: tenantId}});
  if (!tenant) notFound();
  const flash = await searchParams;
  if (!preview) await applyDueBankAccountChanges();
  const leaseRows = await prisma.lease.findMany({
    where: {...(!tenantAccess ? {id: {in: manageableIds}} : {}), OR: [{tenantId}, {parties: {some: {tenantId, role: {in: ["CONTRACTING_PARTY", "PAYER"]}}}}]},
    include: {
      unit: {include: {
        property: {include: portalContactPropertyInclude},
        ownerships: {include: {owner: {select: portalContactOwnerSelect}}},
        meters: {where: {active: true}, include: {readings: {orderBy: {readAt: "desc"}}}},
      }},
      ownerBankAccount: {include: {owner: {select: portalContactOwnerSelect}}},
      charges: {where: {active: true}, include: {
        allocations: {include: {transaction: {select: {bookedAt: true, amountCents: true, currency: true, status: true}}}},
        securityDepositOffsets: true, creditApplications: true,
      }, orderBy: {dueDate: "asc"}},
      parties: {where: {tenantId}, select: {role: true}},
      tasks: {where: {tenantId, tenantPortalRequest: true, OR: [{tenantPortalRequestKind: null}, {tenantPortalRequestKind: "DEFECT"}]}, orderBy: {createdAt: "desc"}, select: {id: true, tenantPortalTitle: true, tenantPortalBody: true, status: true, createdAt: true, tenantEntryConsentAt: true, tenantVisitNote: true}},
    },
    orderBy: {startDate: "asc"},
  });
  const today = businessTodayKey();
  const period = currentPeriod();
  const activeLeases = leaseRows.filter(lease => leaseStatusAt(lease) === "ACTIVE").map(lease => ({
    ...lease,
    charges: lease.charges.map(charge => ({
      ...charge,
      allocations: charge.allocations.filter(allocation => businessDateKey(allocation.transaction.bookedAt) <= today && ["MATCHED", "PARTIAL", "OVERPAYMENT"].includes(allocation.transaction.status)),
      securityDepositOffsets: charge.securityDepositOffsets.filter(offset => businessDateKey(offset.effectiveAt) <= today),
      creditApplications: charge.creditApplications.filter(credit => businessDateKey(credit.effectiveAt) <= today),
    })),
    unit: {...lease.unit, meters: lease.unit.meters.map(meter => ({...meter, readings: currentReadings(meter.readings).sort((a, b) => b.readAt.getTime() - a.readAt.getTime())}))},
  }));
  const sharedDocuments = activeLeases.length ? await prisma.document.findMany({
    where: {AND: [{OR: activeLeases.map(lease => tenantSharedDocumentWhere({id: lease.id, unitId: lease.unitId, propertyId: lease.unit.propertyId}))}, {meterReadingEvidence: {none: {}}}]},
    orderBy: {createdAt: "desc"},
  }) : [];
  const leases = activeLeases.map(lease => ({...lease, documents: sharedDocuments.filter(document => document.leaseId === lease.id)}));
  // Issued PDFs are immutable history, even if their original charge is later disabled.
  const archivedReceipts = activeLeases.length ? await prisma.tenantPaymentReceipt.findMany({
    where: {charge: {leaseId: {in: activeLeases.map(lease => lease.id)}}},
    select: {id: true, issuedAt: true, snapshot: true, charge: {select: {leaseId: true, period: true, active: true}}},
    orderBy: {issuedAt: "desc"},
  }) : [];
  const receiptStatuses = new Map(await Promise.all(leaseRows
    .filter(lease => leases.some(activeLease => activeLease.id === lease.id))
    .flatMap(lease => lease.charges.filter(charge => receiptEligible(charge, lease.currency))
      .map(async charge => [charge.id, await receiptIssuerStatusForLease(lease.id, charge.period)] as const))));
  const first = leases[0];
  const bankNotices = await portalBankNotices(tenantId, actor.id, leaseRows.map(lease => lease.id), preview);
  const messageLeaseIds = leases.filter(lease => lease.tenantId === tenantId || lease.parties.some(party => party.role === "CONTRACTING_PARTY")).map(lease => lease.id);
  const otherBankNotices = bankNotices.filter(notice => !messageLeaseIds.includes(notice.leaseId));
  const firstCanAct = Boolean(first && (first.tenantId === tenantId || first.parties.some(party => party.role === "CONTRACTING_PARTY")));

  return <div className="tenant-portal-v2">
    <a className="tp-skip" href="#prehled">Přejít na obsah</a>
    <header className="tp-topbar">
      <Link href={preview ? "/portfolio" : "/portal/najemnik"} className="tp-brand" aria-label="FlatBerry"><span className="flatberry-brand-bitmap" aria-hidden="true"/></Link>
      <span className="tp-topbar-context">{preview ? <><Info size={15}/> Náhled portálu · pouze pro čtení</> : <><LockKeyhole size={14}/> Váš nájemnický portál</>}</span>
      {preview ? <Link className="tp-back" href={`/najemnici/${tenant.id}`}><ArrowLeft size={16}/> Zpět na nájemníka</Link> : <form action="/api/auth/logout" method="post"><button type="submit" className="tp-text-button">Odhlásit se</button></form>}
    </header>
    <div className="tp-shell">
      <TenantPortalNav leaseId={first?.id} canAct={firstCanAct} preview={preview}/>
      <main className="tp-main" id="prehled">
        <Flash {...flash}/>
        <section className="tp-welcome">
          <div className="tp-welcome-copy"><h1>{greeting(tenant.name, tenant.type === "PERSON")}</h1><p>Vše důležité pro vaše bydlení.</p>
            {first && <a className="tp-home-strip" href={`#domov-${first.id}`}><span className="tp-home-thumb"><EntityAvatar kind="unit" size="lg" identity={first.unitId} photoId={defaultPropertyIllustration("unit", first.unit.propertyId)}/></span><span><strong>Můj domov</strong><small>{[first.unit.property.address, [first.unit.property.postalCode, first.unit.property.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")} · {first.unit.label}</small></span><span className="tp-home-link">Podrobnosti bydlení <ArrowRight size={17}/></span></a>}
          </div>
          <Image className="tp-berry" src="/guide/welcome.webp" width={178} height={178} alt="Berry, váš průvodce bydlením" priority/>
        </section>
        {!leases.length && <section className="tp-card tp-empty"><House size={32}/><h2>Vaše bydlení se připravuje</h2><p>K tomuto účtu zatím není připojena aktuální nájemní smlouva.</p></section>}
        {leases.length > 1 && <nav className="tp-lease-switch" aria-label="Vaše nájmy">{leases.map(lease => <a key={lease.id} href={`#najem-${lease.id}`}><House size={16}/>{lease.unit.property.name} · {lease.unit.label}</a>)}</nav>}
        {leases.map((lease, leaseIndex) => {
          const canAct = lease.tenantId === tenantId || lease.parties.some(party => party.role === "CONTRACTING_PARTY");
          const contact = tenantPortalContact(lease);
          const unpaid = lease.charges.filter(charge => outstandingCents(charge) > 0 && charge.debtTreatment === "CURRENT");
          const charge = unpaid.find(charge => isPastDue(charge.dueDate)) || unpaid.find(charge => charge.period === period) || unpaid[0];
          const futureOnly = Boolean(charge && charge.period > period && businessDateKey(charge.dueDate) > today);
          const paidRents = leaseRows.find(row => row.id === lease.id)!.charges.filter(charge => receiptEligible(charge, lease.currency)).sort((a, b) => a.period.localeCompare(b.period));
          const otherReceivables = lease.charges.some(charge => charge.debtTreatment !== "CURRENT" && outstandingCents(charge) > 0);
          const overdueCount = unpaid.filter(charge => isPastDue(charge.dueDate)).length;
          const lastMeter = lease.unit.meters.flatMap(meter => meter.readings[0] ? [meter.readings[0]] : []).sort((a, b) => b.readAt.getTime() - a.readAt.getTime())[0];
          const openRequests = lease.tasks.filter(task => !["DONE", "CANCELLED"].includes(task.status));
          const accountLabel = lease.ownerBankAccount && (domesticAccountLabel(lease.ownerBankAccount.accountNumber, lease.ownerBankAccount.bankCode) || formatIban(lease.ownerBankAccount.iban));
          const recipient = lease.ownerBankAccount?.owner.name;
          const receipts = archivedReceipts.filter(receipt => receipt.charge.leaseId === lease.id).map(receipt => ({...receipt, period: receiptArchivePeriod(receipt.snapshot, receipt.charge.period)}));
          const contactLabel = contact?.kind === "owner" ? "pronajímateli" : "správci";
          const paymentDetails = charge && <div className="tp-rent-layout">
            <div className="tp-rent-info"><div className="tp-rent-period"><strong>{rentPeriod(charge.period)}</strong><span className={`tp-status tp-status-${isPastDue(charge.dueDate) ? "overdue" : futureOnly ? "scheduled" : "current"}`}>{isPastDue(charge.dueDate) ? "Po splatnosti" : futureOnly ? "Příští nájem" : businessDateKey(charge.dueDate) === today ? "Splatnost dnes" : "Před splatností"}</span></div><strong className="tp-rent-amount">{portalMoney(outstandingCents(charge), lease.currency)}</strong><p className="tp-rent-due">K úhradě · splatnost {date(charge.dueDate)}</p>
              <dl className="tp-payment-details"><div><dt>Příjemce</dt><dd>{recipient || "Zatím nepotvrzen"}</dd></div><div><dt>Účet</dt><dd>{accountLabel || "Zatím nepotvrzen"}</dd></div><div><dt>Variabilní symbol</dt><dd>{lease.variableSymbol || "Není uveden"}</dd></div></dl>
              {overdueCount > 1 && <a className="tp-text-link" href={`#historie-${lease.id}`}>Další nájmy po splatnosti ({overdueCount - 1}) <ArrowRight size={15}/></a>}
            </div>
            <div className="tp-rent-qr"><RentPaymentQr account={lease.ownerBankAccount} amountCents={outstandingCents(charge)} currency={lease.currency} variableSymbol={lease.variableSymbol}/>{accountLabel && <PortalCopy text={`Příjemce: ${recipient || "neuveden"}\nÚčet: ${accountLabel}\nVariabilní symbol: ${lease.variableSymbol}\nČástka: ${portalMoney(outstandingCents(charge), lease.currency)}\nSplatnost: ${date(charge.dueDate)}`}/>}</div>
          </div>;
          const paymentRows: PortalPaymentRow[] = lease.charges.map(charge => {
            const bank = charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
            const offset = charge.securityDepositOffsets.reduce((sum, entry) => sum + entry.amountCents, 0) + charge.creditApplications.reduce((sum, entry) => sum + entry.amountCents, 0);
            const remaining = outstandingCents(charge);
            const paymentState = tenantPortalPaymentState({...charge, remainingCents: remaining, receivedCents: bank, offsetCents: offset}, today);
            return {id: charge.id, period: rentPeriod(charge.period), periodKey: charge.period, amount: portalMoney(charge.amountCents, lease.currency), received: portalMoney(bank, lease.currency), remaining: portalMoney(remaining, lease.currency), ...paymentState,
              due: date(charge.dueDate), allocations: charge.allocations.map(allocation => ({id: allocation.id, date: date(allocation.transaction.bookedAt), amount: portalMoney(allocation.amountCents, lease.currency)})), offset: offset > 0 ? portalMoney(offset, lease.currency) : undefined};
          });
          return <section className="tp-lease" key={lease.id} aria-label={`${lease.unit.property.name} · ${lease.unit.label}`}>
            {leaseIndex > 0 && <h2 className="tp-additional-home"><House size={23}/>{lease.unit.property.name} · {lease.unit.label}<a className="tp-text-link" href={`#domov-${lease.id}`}>Podrobnosti <ArrowRight size={16}/></a></h2>}
            <div className="tp-priority">
              <section id={`najem-${lease.id}`} className={`tp-card tp-rent ${charge && !futureOnly ? isPastDue(charge.dueDate) ? "tp-rent-overdue" : "tp-rent-current" : "tp-rent-paid"}`} aria-labelledby={`najem-title-${lease.id}`}>
                <div className="tp-heading"><span className={`tp-icon ${charge && !futureOnly && isPastDue(charge.dueDate) ? "tp-icon-coral" : "tp-icon-green"}`}><CreditCard size={25}/></span><h2 id={`najem-title-${lease.id}`}>Můj nájem</h2></div>
                {charge && !futureOnly ? paymentDetails : lease.charges.length ? <><div className="tp-paid-message"><CheckCircle2 size={39}/><div><strong>{otherReceivables ? "Aktuální nájem je v pořádku." : "Vše máte uhrazeno."}</strong><p>{otherReceivables ? "Aktuální splatné předpisy jsou vypořádané." : "Splatné nájmy jsou v pořádku."}</p></div></div>{charge ? <details className="tp-next-rent"><summary><CalendarDays size={21}/><span><strong>Další nájem · {rentPeriod(charge.period)}</strong><small>{portalMoney(outstandingCents(charge), lease.currency)} · do {date(charge.dueDate)}</small></span><span className="tp-summary-action">Zobrazit údaje <ChevronRight size={17}/></span></summary>{paymentDetails}</details> : <p className="tp-subtle">Až bude připraven další předpis, najdete platební údaje tady.</p>}</> : <div className="tp-rent-empty"><CalendarDays size={38}/><h3>Váš nájem se připravuje</h3><p>Správce zatím nevystavil první předpis. Platební údaje se zobrazí po jeho doplnění.</p></div>}
              </section>
              <section id={`kontakt-${lease.id}`} className="tp-card tp-contact" aria-labelledby={`kontakt-title-${lease.id}`}>
                <div className="tp-heading"><span className="tp-icon tp-icon-blue"><Phone size={25}/></span><h2 id={`kontakt-title-${lease.id}`}>{contact?.kind === "owner" ? "Kontakt na pronajímatele" : "Váš správce"}</h2></div>
                {contact ? <><div className="tp-contact-person"><UserAvatar user={contact.user || {name: contact.name}} size="lg" className="tp-contact-avatar" imageUrl={contact.user ? `/api/portal/tenants/${tenantId}/manager-avatar/${contact.user.id}` : undefined}/><div className="tp-contact-bio"><span className="tp-contact-role">{contact.kind === "owner" ? "Pronajímatel vašeho bydlení" : "Správa vašeho bydlení"}</span><h3>{contact.name}</h3><p>{contact.user || contact.kind === "owner" ? "S čímkoli kolem bydlení se můžete obrátit na mě." : "Se zprávami a požadavky se můžete obrátit na správu domu."}</p></div>
                  <div className="tp-contact-channels">{contact.phone && <a className="tenant-portal-call" href={`tel:${contact.phone}`}><Phone size={21}/>{phone(contact.phone)}</a>}{contact.email && <a className="tp-contact-email" href={`mailto:${contact.email}`}><Mail size={20}/><span>{contact.email}</span></a>}{!contact.phone && !contact.email && <p className="tp-subtle">Přímé kontaktní údaje zatím nejsou doplněné.</p>}</div></div>
                  <div className="tp-contact-actions">{contact.phone && <a className={`tp-button ${canAct ? "tp-button-soft" : "tp-button-primary"}`} href={`tel:${contact.phone}`}><Phone size={18}/> Zavolat</a>}{canAct && <a className="tp-button tp-button-primary" href={`#zpravy-spravci-${lease.id}-nove`}><MessageCircle size={19}/> Napsat {contactLabel}<ArrowRight size={17}/></a>}</div>
                </> : <div className="tp-contact-empty"><UserAvatar user={{name: "Správa domu"}} size="lg" className="tp-contact-avatar"/><h3>Kontakt se připravuje</h3><p>Správce ani pronajímatel zatím nemá v portálu přiřazený kontakt. Kontaktní údaje najdete také ve své smlouvě.</p>{canAct && <a className="tp-button tp-button-primary" href={`#zpravy-spravci-${lease.id}-nove`}><MessageCircle size={18}/> Napsat správě bydlení</a>}</div>}
                {canAct && <div className="tp-contact-shortcuts"><a href={`#zpravy-spravci-${lease.id}-historie`}>Moje konverzace <ArrowRight size={14}/></a><a href={`#kontaktni-udaje-${lease.id}`}>Nahlásit změnu kontaktu</a></div>}
              </section>
            </div>
            {canAct && <TenantPortalMessages tenantId={tenantId} leaseId={lease.id} user={actor} preview={preview} bankNotices={bankNotices.filter(notice => notice.leaseId === lease.id)} bankAnchorId={bankNotices[0]?.id}/>}
            {canAct && <><h2 className="tp-section-title">Co potřebujete vyřídit?</h2><div className="tp-actions">
              <section className="tp-card tp-action-card tp-action-requests"><div className="tp-heading"><span className="tp-icon tp-icon-blue"><Wrench size={25}/></span><h3>Požadavky</h3></div><p>Něco nefunguje? Dejte nám vědět.</p><a className="tp-button tp-button-primary" href={`#zavady-${lease.id}`}>Nahlásit závadu <ArrowRight size={18}/></a><div className="tp-action-footer"><FileCheck2 size={24}/><div><p>{openRequests.length ? `Otevřená hlášení: ${openRequests.length}` : lease.tasks.length ? "Všechna hlášení jsou vyřízená." : "Zatím jste nic nenahlásili."}</p><a className="tp-text-link" href={`#zavady-${lease.id}-historie`}>Moje hlášení <ArrowRight size={15}/></a></div></div></section>
              <section className="tp-card tp-action-card tp-action-meters"><div className="tp-heading"><span className="tp-icon tp-icon-amber"><Droplets size={26}/></span><h3>Měřidla a odečty</h3></div>{lease.unit.meters.length ? <><div className="tp-meter-summary">{lease.unit.meters.slice(0, 2).map(meter => <div key={meter.id}><span>{meter.label || meterTypes[meter.type]}</span><strong>{meter.readings[0] ? `${meterNumber(meter.readings[0].value)} ${meter.unitOfMeasure}` : "Čeká první odečet"}</strong></div>)}{lease.unit.meters.length > 2 && <small>Další měřidla: {lease.unit.meters.length - 2}</small>}</div><p className="tp-subtle">{lastMeter ? `Poslední odečet ${date(lastMeter.readAt)}` : "Začněte prvním odečtem."}</p><a className="tp-button tp-button-soft" href={`#odecty-${lease.id}`}>Zadat odečet <ArrowRight size={17}/></a></> : <><div className="tp-action-empty"><p>Měřidla zatím nejsou připojena.</p><small>Po doplnění správcem tu uvidíte poslední stavy a můžete zadat nový odečet.</small></div><button className="tp-button" type="button" disabled>Zadat odečet</button></>}</section>
              <section className="tp-card tp-action-card tp-action-documents"><div className="tp-heading"><span className="tp-icon tp-icon-violet"><FileText size={25}/></span><h3>Dokumenty</h3></div><a className="tp-document-shortcut" href={`#dokumenty-${lease.id}`}><FileText size={21}/><span><strong>Smlouvy a předání</strong><small>{lease.documents.length ? `Sdílené dokumenty: ${lease.documents.length}` : "Zatím žádné sdílené dokumenty"}</small></span><ChevronRight size={18}/></a><a className="tp-document-shortcut" href={`#dokumenty-${lease.id}-doklady`}><FileCheck2 size={21}/><span><strong>Doklady o zaplacení</strong><small>{receipts.length ? `Vystavené doklady: ${receipts.length}` : paidRents.length ? `Uhrazená období: ${paidRents.length}` : "Dostupné po plné úhradě nájmu"}</small></span><ChevronRight size={18}/></a><a className="tp-button tp-button-soft" href={`#dokumenty-${lease.id}`}>Otevřít dokumenty <ArrowRight size={17}/></a></section>
            </div></>}
            <PortalPaymentHistory id={`historie-${lease.id}`} rows={paymentRows} currentPeriod={period}/>

            <PortalPanel id={`domov-${lease.id}`} title="Můj domov" subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} feedback={<Flash {...flash}/>}>
              <div className="tp-home-detail"><span className="tp-home-detail-image"><EntityAvatar kind="unit" size="lg" identity={lease.unitId} photoId={defaultPropertyIllustration("unit", lease.unit.propertyId)}/></span><div><span className="tp-eyebrow">Vaše bydlení</span><h3>{lease.unit.property.name} · {lease.unit.label}</h3><p>{lease.unit.property.address}, {lease.unit.property.postalCode} {lease.unit.property.city}</p><p>{[unitTypes[lease.unit.type], lease.unit.disposition ? unitDispositions[lease.unit.disposition] : null, lease.unit.areaM2 ? `${meterNumber(lease.unit.areaM2)} m²` : null, lease.unit.floor ? `Podlaží ${lease.unit.floor}` : null].filter(Boolean).join(" · ")}</p></div></div>
              <dl className="tp-home-facts"><div><dt><CalendarDays size={18}/> Nájem od</dt><dd>{date(lease.startDate)}</dd></div><div><dt><CalendarDays size={18}/> Smlouva do</dt><dd>{lease.endDate ? date(lease.endDate) : "Na dobu neurčitou"}</dd></div>{lease.contractNumber && <div><dt>Číslo smlouvy</dt><dd>{lease.contractNumber}</dd></div>}</dl>
              {canAct && <a className="tp-panel-link" href={`#dokumenty-${lease.id}`}><FileText size={21}/> Nájemní smlouva a předání <ChevronRight size={18}/></a>}
              <section className="tp-home-contact"><h3>Moje kontaktní údaje</h3><p><strong>{tenant.name}</strong></p>{(tenant.communicationEmail || tenant.email) && <p><Mail size={17}/>{tenant.communicationEmail || tenant.email}</p>}{tenant.phone && <p><Phone size={17}/>{phone(tenant.phone)}</p>}{canAct && <a className="tp-text-link" href={`#kontaktni-udaje-${lease.id}`}>Nahlásit změnu kontaktních údajů <ArrowRight size={15}/></a>}{canAct && <small>Na důležité události vám chodí provozní e-mailová upozornění. Jsou vždy zapnutá.</small>}</section>
              <a className="tp-panel-link" href={`#kontakt-${lease.id}`}><Phone size={20}/> Kontakt pro mé bydlení <ChevronRight size={18}/></a>
            </PortalPanel>
            {canAct && <>
              <PortalConversations tenantId={tenantId} leaseId={lease.id} subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} preview={preview} contactLabel={contactLabel}/>
              <PortalContactChange tenantId={tenantId} leaseId={lease.id} subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} preview={preview}/>
              <PortalPanel id={`zavady-${lease.id}`} aliases={leaseIndex === 0 ? ["zavady"] : []} title="Požadavky" subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} feedback={<Flash {...flash}/>} tabs={[
                {id: "nove", label: "Nové hlášení", content: preview ? <div className="tp-info"><Info size={21}/><p>Prohlížíte portál očima nájemníka. Odesílání hlášení je v náhledu vypnuté.</p></div> : <form action={`/api/portal/tenants/${tenantId}/defects`} method="post" encType="multipart/form-data" className="tp-form"><input type="hidden" name="leaseId" value={lease.id}/><input type="hidden" name="submissionKey" value={randomUUID()}/><p>Popište, co potřebujete vyřešit. Správce dostane hlášení i případné fotografie.</p><label className="tp-field"><span>Co se stalo?</span><input name="title" minLength={5} maxLength={140} placeholder="Například: Netěsní kohoutek v kuchyni" required/></label><label className="tp-field"><span>Popis závady</span><textarea name="description" minLength={10} maxLength={5000} rows={4} placeholder="Kde problém vznikl, od kdy trvá a co se děje?" required/></label><label className="tp-field tp-file-field"><span><Camera size={20}/> Fotografie (max. 3)</span><input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple/><small>JPG, PNG nebo WebP. Fotografie jsou nepovinné.</small></label><label className="tp-field"><span>Možný termín a pokyny pro návštěvu</span><input name="tenantVisitNote" maxLength={500} placeholder="Například: V pracovní dny po 17. hodině"/></label><label className="tp-checkbox"><input type="checkbox" name="tenantEntryConsent" value="yes"/><span>Souhlasím se vstupem správce nebo pověřeného technika po předchozí domluvě. Souhlas mohu odvolat.</span></label><div className="tp-form-footer"><span><ShieldCheck size={18}/> Vaše hlášení se předá správě bydlení.</span><button className="tp-button tp-button-primary" type="submit">Předat závadu <ArrowRight size={17}/></button></div></form>},
                {id: "historie", label: "Moje hlášení", content: <div className="tenant-portal-request-history tp-request-history">{lease.tasks.length ? lease.tasks.map(task => <article key={task.id}><div className="tp-request-top"><h3>{task.tenantPortalTitle || "Hlášení z portálu"}</h3><span className={`tp-status ${["DONE", "CANCELLED"].includes(task.status) ? "tp-status-paid" : "tp-status-scheduled"}`}>{taskStatuses[task.status]}</span></div><small>Odesláno {date(task.createdAt)}</small>{task.tenantPortalBody && <p>{task.tenantPortalBody}</p>}<a className="tp-text-link tp-request-conversation" href={`#zpravy-spravci-${lease.id}--${task.id}`}>Zprávy k hlášení <ArrowRight size={15}/></a>{task.tenantVisitNote && <p className="tp-subtle">Návštěva: {task.tenantVisitNote}</p>}{task.tenantEntryConsentAt && <div className="tp-consent"><p><ShieldCheck size={16}/> Vstup po předchozí domluvě povolen.</p>{!preview && <form action={`/api/portal/tenants/${tenantId}/defects/${task.id}/entry-consent`} method="post"><button className="tp-text-button" type="submit">Odvolat souhlas se vstupem</button></form>}</div>}</article>) : <div className="tp-empty"><Wrench size={36}/><h3>Zatím nemáte žádné hlášení</h3><p>Pokud něco nefunguje, v záložce Nové hlášení nám dejte vědět.</p></div>}</div>},
              ]}/>
              <PortalPanel id={`odecty-${lease.id}`} aliases={leaseIndex === 0 ? ["odecty"] : []} title="Měřidla a odečty" subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} feedback={<Flash {...flash}/>}>
                {preview && <div className="tp-info"><Info size={20}/><p>Náhled je pouze pro čtení. Nový odečet zde nelze odeslat.</p></div>}
                {lease.unit.meters.map((meter, index) => <details key={meter.id} className="tp-meter" open={index === 0}><summary><span className="tp-icon tp-icon-amber"><Droplets size={24}/></span><span><strong>{meter.label || meterTypes[meter.type]}</strong><small>{meterTypes[meter.type]}{meter.serialNumber ? ` · č. ${meter.serialNumber}` : ""}</small></span><ChevronRight size={19}/></summary><div className="tp-meter-content"><div className="tp-last-reading"><ShieldCheck size={23}/><div><span>Poslední stav</span><strong>{meter.readings[0] ? `${meterNumber(meter.readings[0].value)} ${meter.unitOfMeasure}` : "Zatím bez odečtu"}</strong>{meter.readings[0] && <small>{date(meter.readings[0].readAt)}{meter.readings[0].evidenceDocumentId && meter.readings[0].leaseId === lease.id && !preview && <> · <a href={`/api/portal/tenants/${tenantId}/documents/${meter.readings[0].evidenceDocumentId}`}>Fotografie odečtu</a></>}</small>}</div></div>{meter.location && <p className="tp-subtle">Umístění: {meter.location}</p>}{!preview && <form action={`/api/portal/tenants/${tenantId}/readings`} method="post" encType="multipart/form-data" className="tp-form"><input type="hidden" name="leaseId" value={lease.id}/><input type="hidden" name="meterId" value={meter.id}/><div className="tp-form-row"><label className="tp-field"><span>Datum odečtu</span><input name="readAt" type="date" defaultValue={today} max={today} required/></label><label className="tp-field"><span>Nový stav ({meter.unitOfMeasure})</span><input name="value" type="number" min="0" step="any" inputMode="decimal" placeholder="Zadejte stav z měřidla" required/></label></div><label className="tp-field tp-file-field"><span><Camera size={20}/> Fotografie měřidla (nepovinné)</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/><small>JPG, PNG nebo WebP · do 8 MB (nepovinné)</small></label><div className="tp-form-footer"><p>Při výměně měřidla nebo chybném minulém odečtu kontaktujte správce.</p><button className="tp-button tp-button-primary" type="submit">Uložit odečet <Check size={18}/></button></div></form>}</div></details>)}
                {!lease.unit.meters.length && <div className="tp-empty"><Droplets size={36}/><h3>Měřidla zatím nejsou připojena</h3><p>Po doplnění správcem zde uvidíte poslední stavy a můžete zadat nový odečet.</p></div>}
              </PortalPanel>
              <PortalPanel id={`dokumenty-${lease.id}`} title="Dokumenty" subtitle={`${lease.unit.property.name} · ${lease.unit.label}`} feedback={<Flash {...flash}/>} tabs={[
                {id: "smlouvy", label: "Smlouvy a předání", content: <><p className="tp-panel-intro">Dokumenty k vašemu bydlení, které vám správce zpřístupnil.</p><div className="portal-document-list tp-documents">{lease.documents.map(document => <article key={document.id}><span className="tp-icon tp-icon-violet"><FileText size={23}/></span><div><strong>{document.title}</strong><small>{documentCategories[document.category]}{document.documentDate ? ` · ${date(document.documentDate)}` : ""}</small></div><a className="tp-button tp-button-soft" href={preview ? `/api/documents/${document.id}/download` : `/api/portal/tenants/${tenantId}/documents/${document.id}`}><Download size={17}/><span>Stáhnout</span></a></article>)}</div>{!lease.documents.length && <div className="tp-empty"><FileText size={38}/><h3>Zatím žádné sdílené dokumenty</h3><p>Až správce přidá smlouvu nebo předávací protokol, najdete je tady.</p></div>}</>},
                {id: "doklady", label: "Doklady o zaplacení", content: <><PortalReceiptPicker tenantId={tenantId} preview={preview} staffHref={`/nemovitosti/${lease.unit.propertyId}/jednotky/${lease.unitId}#doklady`} choices={[...paidRents].reverse().map(charge => {const status = receiptStatuses.get(charge.id); return {id: charge.id, label: `${rentPeriod(charge.period)} · ${portalMoney(charge.amountCents, lease.currency)}`, ready: status?.ready ?? false, reason: status?.reason || "Vystavování dokladu pro toto období se připravuje.", issuerName: status?.issuerName};})}/><h3 className="tp-archive-title">Vystavené doklady</h3><div className="portal-document-list tp-documents">{receipts.map(receipt => <article key={receipt.id}><span className="tp-icon tp-icon-green"><FileCheck2 size={23}/></span><div><strong>{rentPeriod(receipt.period)}</strong><small>Vystaveno {date(receipt.issuedAt)}</small>{!receipt.charge.active && <small>Původní předpis již není aktivní. Doklad zůstává v archivu.</small>}</div><a className="tp-button tp-button-soft" href={preview ? `/api/leases/${lease.id}/receipts/${receipt.id}` : `/api/portal/tenants/${tenantId}/receipts/${receipt.id}`}><Download size={17}/><span>stáhnout PDF</span></a></article>)}</div>{!receipts.length && <p className="tp-empty-copy">Zatím jste žádný doklad nevystavili.</p>}</>},
              ]}/>
            </>}
          </section>;
        })}
        {otherBankNotices.length > 0 && <section className="tp-messages" aria-labelledby="dalsi-oznameni-title"><div className="tp-section-heading"><div><span className="tp-eyebrow">Doručené dokumenty k nájmu</span><h2 id="dalsi-oznameni-title">Oznámení k dalším smlouvám</h2></div></div><div className="tp-message-list">{otherBankNotices.map(notice => <PortalBankNotice key={notice.id} notice={notice} tenantId={tenantId} preview={preview} anchor={notice.id === bankNotices[0]?.id}/>)}</div>{preview && <p className="tp-message-preview">Náhled správce · potvrzení přečtení je dostupné nájemníkovi.</p>}</section>}
        <footer className="tp-footer"><ShieldCheck size={15}/><span>Vaše bydlení. Přehledně a na jednom místě.</span><span>FlatBerry</span></footer>
      </main>
    </div>
  </div>;
}

function rentPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return `Předpis · ${period}`;
  const label = periodLabel(period);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function portalMoney(cents: number, currency = "CZK") {
  if (currency === "CZK") return moneyExact(cents);
  try {return new Intl.NumberFormat("cs-CZ", {style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2}).format(cents / 100);}
  catch {return moneyExact(cents).replace("Kč", currency);}
}
function meterNumber(value: number) {return new Intl.NumberFormat("cs-CZ", {maximumFractionDigits: 4}).format(value);}

function receiptArchivePeriod(snapshot: unknown, fallback: string) {
  if (snapshot && typeof snapshot === "object" && "period" in snapshot && typeof snapshot.period === "string") return snapshot.period;
  return fallback;
}
