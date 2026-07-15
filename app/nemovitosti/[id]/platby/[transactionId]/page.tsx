import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canSeeAll } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { money, date } from "@/lib/format";
import { moneyInput } from "@/lib/forms";
import { paymentStatuses } from "@/lib/labels";
import { Shell } from "@/components/Shell";
import { Flash, FormPage } from "@/components/FormUi";

export const dynamic = "force-dynamic";

export default async function TransactionDetail({ params, searchParams }: { params: Promise<{ id: string; transactionId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id, transactionId } = await params;
  const [property, transaction, query] = await Promise.all([
    requirePropertyAccess(user, id),
    prisma.bankTransaction.findFirst({
      where: { id: transactionId, bankAccount: { propertyId: id } },
      include: {
        bankAccount: true,
        matchedRule: true,
        suggestedLease: { include: { unit: true, tenant: true } },
        allocations: { include: { charge: { include: { lease: { include: { unit: true, tenant: true } } } } } },
      },
    }),
    searchParams,
  ]);
  if (!property || !transaction) notFound();
  const membership = property.memberships.find((row) => row.userId === user.id);
  const canManage = canSeeAll(user.role) || membership?.permission === "EDIT" || membership?.permission === "ADMIN";
  const leases = property.units.flatMap((unit) => unit.leases.map((lease) => ({ ...lease, unit })));
  const openCharges = leases.flatMap((lease) => lease.charges.map((charge) => ({ lease, charge, paid: charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) }))).filter((row) => row.paid < row.charge.amountCents).sort((a, b) => a.charge.dueDate.getTime() - b.charge.dueDate.getTime());
  const allocated = transaction.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const remaining = Math.max(0, transaction.amountCents - allocated);

  return <Shell user={user}><FormPage title="Detail bankovní platby" description={`${property.name} · ${transaction.bankAccount.bankName}`} backHref={`/nemovitosti/${id}/platby`}>
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-7"><div className="card-head"><h2>Transakce</h2><span className={`status ${transaction.status === "MATCHED" ? "ok" : transaction.status === "UNMATCHED" ? "bad" : transaction.status === "IGNORED" ? "" : "warn"}`}>{paymentStatuses[transaction.status]}</span></div><div className="summary-list"><div><span>Datum</span><strong>{date(transaction.bookedAt)}</strong></div><div><span>Částka</span><strong>{money(transaction.amountCents)}</strong></div><div><span>Plátce</span><strong>{transaction.counterpartyName || "Neznámý"}</strong></div><div><span>Účet plátce</span><strong>{transaction.counterpartyIban || "—"}</strong></div><div><span>Variabilní symbol</span><strong>{transaction.variableSymbol || "—"}</strong></div><div><span>Zpráva</span><strong>{transaction.message || "—"}</strong></div><div><span>Výsledek párování</span><strong>{transaction.matchNote || "—"}</strong></div><div><span>Zbývá přiřadit</span><strong>{money(remaining)}</strong></div></div></div>
      <div className="card col-5"><h2>Aktuální přiřazení</h2>{transaction.allocations.length ? <div className="stack-list">{transaction.allocations.map((allocation) => <div className="simple-row" key={allocation.id}><div className="round-icon">✓</div><div><strong>{allocation.charge.lease.unit.label} · {allocation.charge.lease.tenant.name}</strong><small>Předpis {allocation.charge.period}</small></div><div className="right"><strong>{money(allocation.amountCents)}</strong></div></div>)}</div> : <p className="muted-copy">Platba zatím není přiřazena k žádnému předpisu.</p>}{transaction.suggestedLease && <div className="notice" style={{ marginTop: 15 }}>Navržená smlouva: {transaction.suggestedLease.unit.label} · {transaction.suggestedLease.tenant.name}</div>}</div>

      {canManage && remaining > 0 && transaction.amountCents > 0 && <div className="card col-7"><h2>Ruční přiřazení k předpisu</h2><form className="compact-form" action={`/api/properties/${id}/transactions/${transaction.id}/allocate`} method="post"><label className="field"><span>Otevřený předpis</span><select name="chargeId" required>{openCharges.map((row) => <option value={row.charge.id} key={row.charge.id}>{row.lease.unit.label} · {row.lease.tenant.name} · {row.charge.period} · zbývá {money(row.charge.amountCents - row.paid)}</option>)}</select></label><label className="field"><span>Částka (prázdné = maximální možná)</span><input name="amount" type="number" step="0.01" max={moneyInput(remaining)}/></label><button className="primary" type="submit">Přiřadit platbu</button></form></div>}

      {canManage && !transaction.allocations.length && transaction.amountCents > 0 && <div className="card col-5"><h2>Vytvořit pravidlo párování</h2><form className="compact-form" action={`/api/properties/${id}/transactions/${transaction.id}/rule`} method="post"><label className="field"><span>Název pravidla</span><input name="ruleName" placeholder="např. Nájem Byt 3"/></label><label className="field"><span>Cílová smlouva</span><select name="targetLeaseId" defaultValue={transaction.suggestedLeaseId || ""} required><option value="">Vyberte smlouvu</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.unit.label} · {lease.tenant.name} · VS {lease.variableSymbol}</option>)}</select></label><label className="field"><span>Akce</span><select name="action"><option value="MATCH_LEASE">Automaticky párovat</option><option value="SUGGEST_LEASE">Pouze navrhnout</option></select></label><RuleChecks transaction={transaction}/><button className="primary" type="submit">Uložit pravidlo</button></form></div>}

      {canManage && !transaction.allocations.length && <div className="card col-12"><h2>Ignorovat nerelevantní platbu</h2><p className="muted-copy">Jednorázové ignorování ovlivní pouze tuto transakci. Volba budoucího pravidla automaticky ignoruje další odpovídající platby na stejném účtu objektu.</p><form className="ignore-form" action={`/api/properties/${id}/transactions/${transaction.id}/ignore`} method="post"><label className="field"><span>Název pravidla</span><input name="ruleName" placeholder="např. Převod rezervního fondu"/></label><label className="checkbox-field"><input type="checkbox" name="future" defaultChecked/><span>Ignorovat také budoucí odpovídající platby</span></label><RuleChecks transaction={transaction}/><div className="form-actions"><button className="danger-button" type="submit">Ignorovat platbu</button></div></form></div>}
    </div>
  </FormPage></Shell>;
}

function RuleChecks({ transaction }: { transaction: { counterpartyIban: string | null; counterpartyName: string | null; variableSymbol: string | null; message: string | null; amountCents: number } }) {
  return <div className="rule-checks"><strong>Podmínky pravidla</strong>{transaction.counterpartyIban && <label className="checkbox-field"><input type="checkbox" name="useIban" defaultChecked/><span>Účet plátce: {transaction.counterpartyIban}</span></label>}{transaction.counterpartyName && <label className="checkbox-field"><input type="checkbox" name="useName"/><span>Jméno obsahuje: {transaction.counterpartyName}</span></label>}{transaction.variableSymbol && <label className="checkbox-field"><input type="checkbox" name="useVs"/><span>Variabilní symbol: {transaction.variableSymbol}</span></label>}{transaction.message && <label className="checkbox-field"><input type="checkbox" name="useMessage"/><span>Zpráva obsahuje: {transaction.message}</span></label>}<label className="checkbox-field"><input type="checkbox" name="useAmount"/><span>Přesná částka: {money(transaction.amountCents)}</span></label></div>;
}
