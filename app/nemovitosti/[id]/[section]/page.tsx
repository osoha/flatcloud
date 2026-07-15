import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requireUser, canManageProperty } from "@/lib/auth";
import { requirePropertyAccess } from "@/lib/access";
import { money, date } from "@/lib/format";
import { moneyInput } from "@/lib/forms";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { PropertySubnav } from "@/components/PropertySubnav";
import { Flash } from "@/components/FormUi";
import { currentPeriod } from "@/lib/period";
import { bankingConfiguration, bankingProvider } from "@/lib/banking";
import { leaseStatuses, matchingRuleActions, paymentStatuses, unitStatuses, unitTypes } from "@/lib/labels";

export const dynamic = "force-dynamic";

type PaymentRow = Prisma.BankTransactionGetPayload<{
  include: {
    bankAccount: true;
    allocations: true;
    suggestedLease: { include: { unit: true; tenant: true } };
  };
}>;

type MatchingRuleRow = Prisma.BankMatchingRuleGetPayload<{
  include: {
    bankAccount: true;
    targetLease: { include: { unit: true; tenant: true } };
  };
}>;

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string; section: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id, section } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const p = await requirePropertyAccess(user, id);
  if (!p) notFound();
  const canManage = canManageProperty(user.role);
  const period = currentPeriod();
  const leases = p.units.flatMap((unit) => unit.leases.map((lease) => ({ ...lease, unit })));
  const currentCharges = leases.flatMap((lease) => lease.charges.filter((charge) => charge.period === period).map((charge) => ({ lease, charge, paid: charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) })));
  const allCharges = leases.flatMap((lease) => lease.charges.map((charge) => ({ lease, charge, paid: charge.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) }))).sort((a, b) => b.charge.dueDate.getTime() - a.charge.dueDate.getTime());
  const expected = currentCharges.reduce((sum, row) => sum + row.charge.amountCents, 0);
  const paid = currentCharges.reduce((sum, row) => sum + row.paid, 0);
  const txs = await prisma.bankTransaction.findMany({
    where: { bankAccount: { propertyId: id } },
    orderBy: { bookedAt: "desc" },
    include: { bankAccount: true, allocations: true, suggestedLease: { include: { unit: true, tenant: true } } },
  });
  const debts = allCharges.filter((row) => row.paid < row.charge.amountCents);
  const uniqueTenants = Array.from(new Map(leases.map((lease) => [lease.tenant.id, { tenant: lease.tenant, leases: leases.filter((row) => row.tenant.id === lease.tenant.id) }])).values());
  const propertyOwners = p.ownerships.length ? p.ownerships : [{ id: "legacy", ownerId: p.ownerId, owner: p.owner, shareBasisPoints: 10000, note: null }];
  const propertyOwnerNames = propertyOwners.map((row) => row.owner.name).join(", ");

  let owners = [] as Awaited<ReturnType<typeof prisma.owner.findMany>>;
  let rules: MatchingRuleRow[] = [];
  let institutions: { name: string; country: string; psuTypes: string[] }[] = [];
  const bankConfig = bankingConfiguration();
  if (section === "vlastnici" || section === "banka") {
    owners = await prisma.owner.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }
  if (section === "banka") {
    rules = await prisma.bankMatchingRule.findMany({
      where: { propertyId: id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: { bankAccount: true, targetLease: { include: { unit: true, tenant: true } } },
    });
    if (bankConfig.configured) {
      institutions = await bankingProvider().listInstitutions("CZ").catch(() => []);
      if (!institutions.length && bankConfig.provider === "enablebanking") institutions = [{ name: "Mock ASPSP", country: "CZ", psuTypes: ["business", "personal"] }];
    }
  }

  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>{p.name}</span></div>
    <div className="property-header">
      <div className="property-big-icon">⌂</div>
      <div><h1>{p.name}</h1><p>{p.address}, {p.postalCode ? `${p.postalCode} ` : ""}{p.city}</p><div className="property-meta"><span className="meta-pill">{propertyOwnerNames}</span><span className="meta-pill">{p.units.length} jednotek</span><span className="meta-pill">{p.bankAccounts[0]?.bankName || "Banka nepřipojena"}</span></div></div>
      <div className="property-header-right"><span>Saldo {period}</span><strong className={paid - expected < 0 ? "negative" : "positive"}>{money(paid - expected)}</strong></div>
    </div>
    <PropertySubnav propertyId={id} active={section}/><Flash ok={query.ok} error={query.error}/>

    {section === "prehled" && <>
      <div className="stat-grid"><Stat label="Předpis" value={money(expected)} note={period}/><Stat label="Uhrazeno" value={money(paid)} note={`${expected ? Math.round(paid / expected * 100) : 100} % inkaso`} good/><Stat label="Dluh" value={money(Math.max(0, expected - paid))} note={`${debts.length} otevřených předpisů`} bad/><Stat label="Jednotky" value={String(p.units.length)} note={`${p.units.filter((unit) => unit.status === "OCCUPIED").length} obsazených`}/><Stat label="Nespárované" value={String(txs.filter((transaction) => transaction.status === "UNMATCHED").length)} note="bankovní transakce"/></div>
      <div className="detail-grid"><div className="card col-8"><div className="card-head"><h2>Poslední platby</h2><Link href={`/nemovitosti/${id}/platby`}>Zobrazit vše</Link></div><TablePayments propertyId={id} txs={txs.slice(0, 6)}/></div><div className="card col-4"><div className="card-head"><h2>Stav evidence</h2></div><div className="summary-list"><div><span>Aktivní smlouvy</span><strong>{leases.filter((lease) => lease.status === "ACTIVE").length}</strong></div><div><span>Vlastníci objektu</span><strong>{propertyOwners.length}</strong></div><div><span>Předpisy za období</span><strong>{currentCharges.length}</strong></div><div><span>Otevřené dluhy</span><strong>{debts.length}</strong></div></div></div></div>
    </>}

    {section === "jednotky" && <SectionCard title="Jednotky" action={canManage ? <Link className="primary" href={`/nemovitosti/${id}/jednotky/nova`}><Plus size={15}/> Přidat jednotku</Link> : null}><GenericTable headers={["Jednotka", "Typ", "Podlaží", "Plocha", "Vlastník", "Nájemník", "Stav", ""]} rows={p.units.map((unit) => { const active = unit.leases.find((lease) => lease.status === "ACTIVE"); const unitOwners = unit.ownerships.length ? unit.ownerships.map((row) => row.owner.name).join(", ") : propertyOwnerNames; return [<strong key="l">{unit.label}</strong>, unitTypes[unit.type], unit.floor || "—", unit.areaM2 ? `${unit.areaM2} m²` : "—", unitOwners, active?.tenant.name || "Volná", <span className={`status ${unit.status === "OCCUPIED" ? "ok" : unit.status === "RENOVATION" ? "warn" : ""}`} key="s">{unitStatuses[unit.status]}</span>, canManage ? <Link className="table-link" key="e" href={`/nemovitosti/${id}/jednotky/${unit.id}/upravit`}>Upravit</Link> : ""]; })}/></SectionCard>}

    {section === "vlastnici" && <div className="detail-grid">
      <div className="card col-7"><div className="card-head"><h2>Vlastníci objektu</h2></div><div className="stack-list">{propertyOwners.map((ownership) => <form className="inline-edit-card" action={`/api/properties/${id}/ownerships/${ownership.id}`} method="post" key={ownership.id}><div className="inline-edit-grid"><label className="field"><span>Vlastník</span><input value={ownership.owner.name} readOnly/></label><label className="field"><span>Podíl %</span><input name="sharePercent" type="number" min="0.01" max="100" step="0.01" defaultValue={ownership.shareBasisPoints / 100}/></label><label className="field"><span>Poznámka</span><input name="note" defaultValue={ownership.note || ""}/></label></div>{canManage && ownership.id !== "legacy" && <div className="mini-actions"><button className="secondary" type="submit">Uložit</button><button className="danger-button" name="mode" value="delete" type="submit">Odebrat</button></div>}</form>)}</div></div>
      <div className="card col-5"><h2>Přidat spoluvlastníka</h2><p className="muted-copy">Podíl je evidenční údaj. U SVJ lze vlastníky konkrétních bytů nastavit samostatně u každé jednotky.</p>{canManage && <form className="compact-form" action={`/api/properties/${id}/ownerships`} method="post"><label className="field"><span>Vlastník</span><select name="ownerId" required>{owners.map((owner) => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Podíl %</span><input name="sharePercent" type="number" min="0.01" max="100" step="0.01" defaultValue="100" required/></label><label className="field"><span>Poznámka</span><input name="note" placeholder="např. podíl na společných částech"/></label><button className="primary" type="submit">Přidat vlastníka</button></form>}</div>
      <div className="card col-12"><div className="card-head"><h2>Vlastníci jednotlivých jednotek</h2></div><GenericTable headers={["Jednotka", "Vlastník / vlastníci", "Součet podílů", ""]} rows={p.units.map((unit) => [<strong key="u">{unit.label}</strong>, unit.ownerships.length ? unit.ownerships.map((row) => `${row.owner.name} (${row.shareBasisPoints / 100} %)`).join(", ") : "Nenastaveno", `${unit.ownerships.reduce((sum, row) => sum + row.shareBasisPoints, 0) / 100} %`, canManage ? <Link className="table-link" key="e" href={`/nemovitosti/${id}/jednotky/${unit.id}/upravit`}>Nastavit</Link> : ""])}/></div>
    </div>}

    {section === "najemnici" && <SectionCard title="Nájemníci" action={canManage ? <Link className="primary" href={`/nemovitosti/${id}/najemnici/novy`}><Plus size={15}/> Přidat nájemníka</Link> : null}><GenericTable headers={["Nájemník", "Jednotky", "E-mail", "Telefon", "Stav", ""]} rows={uniqueTenants.map(({ tenant, leases: tenantLeases }) => [<strong key="n">{tenant.name}</strong>, tenantLeases.map((lease) => lease.unit.label).join(", "), tenant.email || "—", tenant.phone || "—", <span className={`status ${tenant.active ? "ok" : "bad"}`} key="s">{tenant.active ? "Aktivní" : "Neaktivní"}</span>, canManage ? <Link className="table-link" key="e" href={`/nemovitosti/${id}/najemnici/${tenant.id}/upravit`}>Upravit</Link> : ""])}/></SectionCard>}

    {section === "smlouvy" && <SectionCard title="Nájemní smlouvy" action={canManage ? <Link className="primary" href={`/nemovitosti/${id}/smlouvy/nova`}><Plus size={15}/> Přidat smlouvu</Link> : null}><GenericTable headers={["Jednotka", "Nájemník", "Číslo smlouvy", "Od", "Do", "Měsíčně", "Stav", ""]} rows={leases.map((lease) => [lease.unit.label, lease.tenant.name, lease.contractNumber || "—", date(lease.startDate), lease.endDate ? date(lease.endDate) : "neurčito", money(lease.paymentItems.filter((item) => item.active).reduce((sum, item) => sum + item.amountCents, 0)), leaseStatuses[lease.status], canManage ? <Link className="table-link" key="e" href={`/nemovitosti/${id}/smlouvy/${lease.id}/upravit`}>Upravit</Link> : ""])}/></SectionCard>}

    {section === "predpisy" && <><div className="card generation-card"><div><h2>Měsíční předpisy</h2><p>Vygenerují se z položek platných pro zvolené období. Existující předpis se nepřepíše.</p></div>{canManage && <form action={`/api/properties/${id}/charges/generate`} method="post" className="generation-form"><input type="month" name="period" defaultValue={period} required/><button className="primary" type="submit">Vytvořit předpisy</button></form>}</div><SectionCard title="Předpisy a šablony" action={null}><GenericTable headers={["Jednotka", "Nájemník", "Měsíční šablona", "Poslední předpis", "Saldo", ""]} rows={leases.map((lease) => { const latest = lease.charges[0]; const latestPaid = latest?.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) || 0; return [lease.unit.label, lease.tenant.name, money(lease.paymentItems.filter((item) => item.active).reduce((sum, item) => sum + item.amountCents, 0)), latest?.period || "—", latest ? money(latestPaid - latest.amountCents) : "—", <Link className="table-link" key="e" href={`/nemovitosti/${id}/predpisy/${lease.id}`}>Otevřít předpisy</Link>]; })}/></SectionCard></>}

    {section === "platby" && <SectionCard title="Přijaté platby" action={canManage ? <Link className="primary" href={`/nemovitosti/${id}/platby/nova`}><Plus size={15}/> Ruční platba</Link> : null}><TablePayments propertyId={id} txs={txs}/></SectionCard>}

    {section === "dluznici" && <SectionCard title="Otevřené pohledávky" action={null}><GenericTable headers={["Nájemník", "Jednotka", "Období", "Splatnost", "Předpis", "Uhrazeno", "Dluh"]} rows={debts.map((row) => [row.lease.tenant.name, row.lease.unit.label, <Link className="table-link" key="p" href={`/nemovitosti/${id}/predpisy/mesicni/${row.charge.id}`}>{row.charge.period}</Link>, date(row.charge.dueDate), money(row.charge.amountCents), money(row.paid), <strong className="negative" key="d">{money(row.charge.amountCents - row.paid)}</strong>])}/></SectionCard>}

    {section === "banka" && <div className="detail-grid">
      <div className="card col-7"><div className="card-head"><h2>Bankovní účty objektu</h2></div>{p.bankAccounts.length ? <div className="stack-list">{p.bankAccounts.filter((account) => account.provider !== "manual").map((account) => <div className="bank-account-card" key={account.id}><div className="bank-detail"><div className="bank-logo">BANK</div><div><h3>{account.bankName}</h3><p>{account.accountName || account.ibanMasked} · {account.currency}</p><p>Stav: {account.connectionStatus} · poslední synchronizace {account.lastSyncedAt ? date(account.lastSyncedAt) : "nikdy"}</p></div></div><div className="bank-account-actions">{account.balanceCents !== null && <strong>{money(account.balanceCents)}</strong>}{canManage && <form action={`/api/banking/accounts/${account.id}/sync`} method="post"><button className="secondary" type="submit">Synchronizovat</button></form>}</div>{canManage && <form className="inline-edit-grid bank-settings" action={`/api/banking/accounts/${account.id}/settings`} method="post"><label className="field"><span>Název účtu</span><input name="accountName" defaultValue={account.accountName || ""}/></label><label className="field"><span>Vlastník účtu</span><select name="ownerId" defaultValue={account.ownerId || ""}><option value="">Objekt / SVJ</option>{owners.map((owner) => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label><div className="mini-actions"><button className="secondary" type="submit">Uložit</button></div></form>}</div>)}</div> : <div className="empty-state"><h2>Účet zatím není připojen</h2><p>Po nastavení sandboxových klíčů lze spustit skutečný bankovní autorizační tok.</p></div>}</div>
      <div className="card col-5"><h2>Připojit bankovní účet</h2><p className="muted-copy">Aktuální adaptér: <strong>{bankConfig.provider}</strong>. Pro první test doporučujeme sandbox a banku Mock ASPSP.</p>{bankConfig.configured ? canManage && <form className="compact-form" action="/api/banking/connect" method="post"><input type="hidden" name="propertyId" value={id}/><label className="field"><span>Banka / sandbox</span><select name="bankName" required>{institutions.map((institution) => <option value={institution.name} key={`${institution.country}-${institution.name}`}>{institution.name} ({institution.country})</option>)}</select></label><label className="field"><span>Země</span><input name="country" defaultValue={institutions[0]?.country || "CZ"} required/></label><label className="field"><span>Typ přístupu</span><select name="psuType" defaultValue="business"><option value="business">Firemní účet</option><option value="personal">Osobní účet</option></select></label><button className="primary" type="submit">Připojit přes banku</button></form> : <div className="notice">V Renderu doplňte <code>ENABLE_BANKING_APP_ID</code>, <code>ENABLE_BANKING_PRIVATE_KEY</code> a nastavte <code>BANKING_PROVIDER=enablebanking</code>.</div>}</div>
      <div className="card col-12"><div className="card-head"><div><h2>Párovací a ignorační pravidla</h2><p className="muted-copy">Pravidla se vyhodnocují od nejnižší priority. Ignorace má být před obecnými párovacími pravidly.</p></div>{canManage && <form action={`/api/properties/${id}/matching/reprocess`} method="post"><button className="secondary" type="submit">Znovu zpracovat platby</button></form>}</div>{rules.length ? <div className="stack-list">{rules.map((rule) => <form className="inline-edit-card" action={`/api/properties/${id}/matching-rules/${rule.id}`} method="post" key={rule.id}><div className="rule-summary"><div><strong>{rule.name}</strong><small>{matchingRuleActions[rule.action]} · priorita {rule.priority}{rule.bankAccount ? ` · ${rule.bankAccount.bankName}` : ""}</small></div><span className={`status ${rule.active ? "ok" : "bad"}`}>{rule.active ? "Aktivní" : "Vypnuto"}</span></div><div className="rule-conditions">{rule.counterpartyIban && <span>IBAN {rule.counterpartyIban}</span>}{rule.counterpartyNameContains && <span>Jméno obsahuje „{rule.counterpartyNameContains}“</span>}{rule.variableSymbol && <span>VS {rule.variableSymbol}</span>}{rule.messageContains && <span>Zpráva obsahuje „{rule.messageContains}“</span>}{rule.amountCents !== null && <span>Částka {money(rule.amountCents)}</span>}{rule.targetLease && <span>Cíl: {rule.targetLease.unit.label} · {rule.targetLease.tenant.name}</span>}</div>{canManage && <div className="mini-actions"><button className="danger-button" name="mode" value="delete" type="submit">Odstranit pravidlo</button></div>}</form>)}</div> : <div className="table-empty">Zatím nejsou nastavena žádná pravidla.</div>}</div>
      {canManage && <div className="card col-12"><h2>Nové pravidlo</h2><form className="form-grid compact-rule-form" action={`/api/properties/${id}/matching-rules`} method="post"><label className="field"><span>Název</span><input name="name" required placeholder="např. Ignorovat převody mezi vlastními účty"/></label><label className="field"><span>Akce</span><select name="action" defaultValue="IGNORE"><option value="IGNORE">Ignorovat</option><option value="MATCH_LEASE">Automaticky párovat</option><option value="SUGGEST_LEASE">Pouze navrhnout</option></select></label><label className="field"><span>Bankovní účet</span><select name="bankAccountId"><option value="">Všechny účty objektu</option>{p.bankAccounts.filter((account) => account.provider !== "manual").map((account) => <option value={account.id} key={account.id}>{account.bankName} · {account.ibanMasked}</option>)}</select></label><label className="field"><span>Cílová smlouva</span><select name="targetLeaseId"><option value="">Pouze pro ignoraci</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.unit.label} · {lease.tenant.name} · VS {lease.variableSymbol}</option>)}</select></label><label className="field"><span>IBAN protistrany</span><input name="counterpartyIban"/></label><label className="field"><span>Jméno obsahuje</span><input name="counterpartyNameContains"/></label><label className="field"><span>Variabilní symbol</span><input name="variableSymbol"/></label><label className="field"><span>Zpráva obsahuje</span><input name="messageContains"/></label><label className="field"><span>Částka</span><input name="amount" type="number" step="0.01"/></label><label className="field"><span>Priorita</span><input name="priority" type="number" defaultValue="100"/></label><label className="checkbox-field"><input name="active" type="checkbox" defaultChecked/><span>Pravidlo je aktivní</span></label><div className="form-actions field-full"><button className="primary" type="submit">Vytvořit pravidlo</button></div></form></div>}
    </div>}

    {section === "nastaveni" && <div className="detail-grid"><div className="card col-8"><div className="card-head"><h2>Nastavení nemovitosti</h2>{canManage && <Link className="primary" href={`/nemovitosti/${id}/upravit`}><Settings2 size={15}/> Upravit</Link>}</div><div className="summary-list"><div><span>Název</span><strong>{p.name}</strong></div><div><span>Hlavní evidenční vlastník</span><strong>{p.owner.name}</strong></div><div><span>Vlastníci objektu</span><strong>{propertyOwnerNames}</strong></div><div><span>Adresa</span><strong>{p.address}, {p.city}</strong></div><div><span>Stav</span><strong>{p.active ? "Aktivní" : "Neaktivní"}</strong></div></div>{p.note && <div className="notice" style={{ marginTop: 16 }}>{p.note}</div>}</div><div className="card col-4"><h2>Bezpečnost dat</h2><p className="muted-copy">Jednotky, smlouvy, předpisy, bankovní účty i pravidla jsou vždy vázány na tento objekt. Vlastník účtu může být objekt/SVJ nebo konkrétní spoluvlastník.</p></div></div>}
  </div></Shell>;
}

function Stat({ label, value, note, good, bad }: { label: string; value: string; note: string; good?: boolean; bad?: boolean }) { return <div className="card stat"><div><span>{label}</span><strong className={bad ? "negative" : good ? "positive" : ""}>{value}</strong><small className={good ? "good" : bad ? "bad" : ""}>{note}</small></div></div>; }
function SectionCard({ title, action, children }: { title: string; action: React.ReactNode; children: React.ReactNode }) { return <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>{title}</h2></div>{action}</div>{children}</div>; }
function GenericTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) { return <div className="table-wrap"><table><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="table-empty">Bez záznamů</td></tr>}</tbody></table></div>; }
function TablePayments({ propertyId, txs }: { propertyId: string; txs: PaymentRow[] }) { return <div className="table-wrap"><table><thead><tr><th>Datum</th><th>Plátce</th><th>VS</th><th>Částka</th><th>Stav</th><th>Návrh / poznámka</th><th></th></tr></thead><tbody>{txs.length ? txs.map((transaction) => <tr key={transaction.id}><td>{date(transaction.bookedAt)}</td><td>{transaction.counterpartyName || "Neznámý plátce"}<span className="owner-sub">{transaction.counterpartyIban || transaction.message}</span></td><td>{transaction.variableSymbol || "—"}</td><td className={transaction.amountCents < 0 ? "money negative" : "money"}>{money(transaction.amountCents)}</td><td><span className={`status ${transaction.status === "MATCHED" ? "ok" : transaction.status === "UNMATCHED" ? "bad" : transaction.status === "IGNORED" ? "" : "warn"}`}>{paymentStatuses[transaction.status]}</span></td><td>{transaction.suggestedLease ? `${transaction.suggestedLease.unit.label} · ${transaction.suggestedLease.tenant.name}` : transaction.matchNote || "—"}</td><td><Link className="table-link" href={`/nemovitosti/${propertyId}/platby/${transaction.id}`}>Vyřešit</Link></td></tr>) : <tr><td colSpan={7} className="table-empty">Bez transakcí</td></tr>}</tbody></table></div>; }
