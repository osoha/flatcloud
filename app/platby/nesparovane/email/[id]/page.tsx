import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { bankAccountMatches, bankNameForCode } from "@/lib/inbound-bank/bank-email";
import { verificationCodeForAccount, verificationCodeForLink } from "@/lib/bank-email-verification";
import { linkIsUsedByUnit } from "@/lib/bank-verification-scope";
import { Shell } from "@/components/Shell";
import { Flash, FormPage } from "@/components/FormUi";

export const dynamic = "force-dynamic";

function digits(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function accountLabel(account: { label: string | null; accountNumber: string | null; bankCode: string | null; iban: string | null }) {
  const local = account.accountNumber && account.bankCode ? `${account.accountNumber}/${account.bankCode}` : null;
  return account.label || local || account.iban || "bankovní účet";
}

export default async function InboxPaymentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const [row, leases, paymentLinks, query] = await Promise.all([
    prisma.inboxPayment.findUnique({ where: { id } }),
    prisma.lease.findMany({ where: { unit: { property: { active: true } } }, include: { unit: { include: { property: true } }, tenant: true, ownerBankAccount: true }, orderBy: [{ unit: { property: { name: "asc" } } }, { unit: { label: "asc" } }] }),
    prisma.propertyPaymentAccount.findMany({ where: { active: true, property: { active: true } }, include: { property: { include: { units: { select: { label: true, ownerships: { select: { ownerBankAccountId: true } } } } } }, ownerBankAccount: true }, orderBy: { createdAt: "asc" } }),
    searchParams,
  ]);
  if (!row) notFound();

  const isOneCrownTest = row.amountCents === 100;
  const matchingLinks = paymentLinks.filter((link) => link.ownerBankAccount.active && linkIsUsedByUnit(link.ownerBankAccountId, link.property.units) && bankAccountMatches(link.ownerBankAccount, row.recipientAccount)).sort((a, b) => a.property.name.localeCompare(b.property.name, "cs"));
  const exactTestLink = matchingLinks.find((link) => digits(verificationCodeForLink(link.id)) === digits(row.variableSymbol));

  return <Shell user={user}><FormPage title="Bankovní e-mail – ruční řešení" description="Sběrný e-mail bankovních notifikací" backHref="/platby/nesparovane">
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-7"><h2>Rozpoznaná platba</h2><div className="summary-list">
        <div><span>Banka</span><strong>{bankNameForCode(row.bank)}{row.bank && row.bank !== "UNKNOWN" ? ` · ${row.bank}` : ""}</strong></div>
        <div><span>Důvěryhodnost zdroje</span><strong>{row.sourceTrusted ? "Ověřený bankovní zdroj" : "Vyžaduje ruční kontrolu"}</strong></div>
        <div><span>Přijato</span><strong>{date(row.receivedAt)}</strong></div>
        <div><span>Datum platby</span><strong>{row.bookedAt ? date(row.bookedAt) : "—"}</strong></div>
        <div><span>Částka</span><strong>{row.amountCents ? money(row.amountCents) : "—"}</strong></div>
        <div><span>Cílový účet</span><strong>{row.recipientAccount || "—"}</strong></div>
        <div><span>Plátce</span><strong>{row.counterpartyName || "—"}</strong></div>
        <div><span>Účet plátce</span><strong>{row.counterpartyAccount || "—"}</strong></div>
        <div><span>VS / SS / KS</span><strong>{[row.variableSymbol && `VS ${row.variableSymbol}`, row.specificSymbol && `SS ${row.specificSymbol}`, row.constantSymbol && `KS ${row.constantSymbol}`].filter(Boolean).join(" · ") || "—"}</strong></div>
        <div><span>Zpráva</span><strong>{row.message || "—"}</strong></div>
        <div><span>Odesílatel</span><strong>{row.sender || "—"}</strong></div>
        <div><span>Parser</span><strong>{row.parseNote || "—"}</strong></div>
      </div></div>

      <div className="card col-5">
        {isOneCrownTest ? <>
          <h2>Ověření bankovního účtu</h2>
          <p className="muted-copy">Platba 1,00 Kč se nezaúčtuje jako nájemné. Ověří konkrétní účet vlastníka pouze pro jednotky v dané nemovitosti, které tento účet skutečně používají.</p>
          {matchingLinks.length ? <form className="compact-form" action={`/api/inbound-payments/${row.id}/verify-account`} method="post">
            <label className="field"><span>Nemovitost a účet</span><select name="linkId" required defaultValue={exactTestLink?.id || (matchingLinks.length === 1 ? matchingLinks[0].id : "")}>
              {!exactTestLink && matchingLinks.length > 1 ? <option value="" disabled>Vyberte nemovitost / účet</option> : null}
              {matchingLinks.map((link) => { const unitLabels=link.property.units.filter((unit)=>unit.ownerships.some((ownership)=>ownership.ownerBankAccountId===link.ownerBankAccountId)).map((unit)=>unit.label).join(", "); return <option value={link.id} key={link.id}>{link.property.name} · {unitLabels} · {accountLabel(link.ownerBankAccount)} · test VS {verificationCodeForLink(link.id)}</option>; })}
            </select></label>
            {exactTestLink ? <div className="notice">VS odpovídá testovacímu kódu pro <strong>{exactTestLink.property.name}</strong>.</div> : null}
            <button className="primary" type="submit">Potvrdit jako test bankovního účtu</button>
          </form> : <div className="notice">Cílový účet z e-mailu není přiřazen žádné jednotce aktivní nemovitosti. Nejdřív nastavte vlastníka a bankovní účet u konkrétní jednotky.</div>}
        </> : <>
          <h2>Přiřadit ke smlouvě</h2>
          <p className="muted-copy">Tím vznikne standardní bankovní transakce v objektu a částka se automaticky rozpočítá na nejstarší otevřené předpisy vybrané smlouvy.</p>
          {row.amountCents && row.amountCents > 0 ? <form className="compact-form" action={`/api/inbound-payments/${row.id}/assign`} method="post"><label className="field"><span>Smlouva</span><select name="leaseId" required defaultValue=""><option value="" disabled>Vyberte objekt / jednotku / nájemníka</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.unit.property.name} · {lease.unit.label} · {lease.tenant.name} · VS {lease.variableSymbol}</option>)}</select></label><button className="primary" type="submit">Přiřadit a zaúčtovat</button></form> : <div className="notice">E-mail nemá rozpoznanou kladnou částku a nelze ho zaúčtovat.</div>}
        </>}

        {!row.transactionId ? <form action={`/api/inbound-payments/${row.id}/reprocess`} method="post" style={{marginTop:14}}><input type="hidden" name="forceReview" value={row.status==="IGNORED"?"1":"0"}/><button className="secondary" type="submit">Znovu zpracovat parserem / vrátit ke kontrole</button></form> : null}
        <form action={`/api/inbound-payments/${row.id}/ignore`} method="post" style={{marginTop:14}}><button className="danger-button" type="submit">Označit jako nerelevantní</button></form>
      </div>

      <div className="card col-12"><h2>Původní obsah</h2><pre className="email-raw">{row.rawExcerpt || row.subject || "Obsah není k dispozici."}</pre></div>
    </div>
  </FormPage></Shell>;
}
