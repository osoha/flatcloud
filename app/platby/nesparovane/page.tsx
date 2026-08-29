import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { bankNameForCode } from "@/lib/inbound-bank/bank-email";
import { paymentStatuses } from "@/lib/labels";
import { Shell } from "@/components/Shell";
import { NavigableTableRow } from "@/components/NavigableTableRow";

export const dynamic = "force-dynamic";

export default async function UnmatchedPaymentsPage() {
  // V21.3.5 compatibility: the retained bank-income audit query remains conceptually `where: { status: "IGNORED" }`, refined below only to separate irrelevant mail.
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [transactions, inbox, ignored, irrelevantEmails] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { amountCents: { gt: 0 }, status: { in: ["UNMATCHED", "SUGGESTED"] } },
      include: { bankAccount: { include: { property: true } }, suggestedLease: { include: { unit: true, tenant: true } } },
      orderBy: { bookedAt: "desc" },
    }),
    prisma.inboxPayment.findMany({ where: { status: { in: ["RECEIVED", "UNMATCHED", "ERROR"] } }, orderBy: { receivedAt: "desc" } }),
    prisma.inboxPayment.findMany({ where: { status: "IGNORED", NOT: { parseNote: { startsWith: "Nerelevantní e-mail:" } } }, include: { property: true }, orderBy: { receivedAt: "desc" }, take: 100 }),
    prisma.inboxPayment.findMany({ where: { status: "IGNORED", parseNote: { startsWith: "Nerelevantní e-mail:" } }, orderBy: { receivedAt: "desc" }, take: 100 }),
  ]);
  return <Shell user={user}><div className="page">
    <div className="breadcrumb"><Link href="/portfolio">Portfolio</Link><span>›</span><span>Nespárované platby</span></div>
    <div className="page-title"><div><h1>Globální fronta nespárovaných plateb</h1><p>Centrální pracovní fronta pouze pro hlavního administrátora. Obsahuje bankovní transakce čekající na potvrzení i bankovní e-maily, u kterých nebylo možné určit objekt.</p></div></div>
    <div className="stat-grid"><QueueStat label="Celkem k řešení" value={String(transactions.length + inbox.length)} bad={transactions.length + inbox.length > 0}/><QueueStat label="Bankovní transakce" value={String(transactions.length)}/><QueueStat label="Sběrný e-mail" value={String(inbox.length)}/></div>
    <div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Bankovní transakce</h2><p>Transakce už mají určenou nemovitost, ale nemají jednoznačné finální spárování.</p></div></div><div className="table-wrap"><table><thead><tr><th>Datum</th><th>Nemovitost</th><th>Plátce</th><th>VS</th><th>Částka</th><th>Stav</th><th>Návrh</th><th></th></tr></thead><tbody>{transactions.length ? transactions.map((tx) => <NavigableTableRow href={`/nemovitosti/${tx.bankAccount.propertyId}/platby/${tx.id}`} ariaLabel={`Otevřít platbu ${tx.variableSymbol || tx.id}`} key={tx.id}><td>{date(tx.bookedAt)}</td><td>{tx.bankAccount.property.name}</td><td>{tx.counterpartyName || "Neznámý"}<span className="owner-sub">{tx.counterpartyIban || tx.message || "—"}</span></td><td>{tx.variableSymbol || "—"}</td><td className="money">{money(tx.amountCents)}</td><td><span className={`status ${tx.status === "UNMATCHED" ? "bad" : "warn"}`}>{paymentStatuses[tx.status]}</span></td><td>{tx.suggestedLease ? `${tx.suggestedLease.unit.label} · ${tx.suggestedLease.tenant.name}` : tx.matchNote || "—"}</td><td><Link className="table-link" href={`/nemovitosti/${tx.bankAccount.propertyId}/platby/${tx.id}`}>Spárovat</Link></td></NavigableTableRow>) : <tr><td colSpan={8} className="table-empty">Žádné bankovní transakce nečekají na spárování.</td></tr>}</tbody></table></div></div>
    <div className="card portfolio-table-card" style={{marginTop:16}}><div className="table-toolbar"><div><h2>Bankovní e-maily bez objektu</h2><p>Parser rozpoznal e-mail, ale chybí jednoznačné propojení na účet / smlouvu nebo formát notifikace nebyl úplný.</p></div></div><div className="table-wrap"><table><thead><tr><th>Přijato</th><th>Banka</th><th>Částka</th><th>Cílový účet</th><th>Plátce</th><th>VS</th><th>Výsledek parseru</th><th></th></tr></thead><tbody>{inbox.length ? inbox.map((row) => <NavigableTableRow href={`/platby/nesparovane/email/${row.id}`} ariaLabel="Otevřít bankovní e-mail" key={row.id}><td>{date(row.receivedAt)}</td><td>{bankNameForCode(row.bank)}{row.bank && row.bank !== "UNKNOWN" ? ` · ${row.bank}` : ""}<span className="owner-sub">{row.sourceTrusted ? "ověřený zdroj" : "ruční kontrola"}</span></td><td className="money">{row.amountCents ? money(row.amountCents) : "—"}</td><td>{row.recipientAccount || "—"}</td><td>{row.counterpartyName || "—"}<span className="owner-sub">{row.counterpartyAccount}</span></td><td>{row.variableSymbol || "—"}</td><td>{row.parseNote || "—"}</td><td><Link className="table-link" href={`/platby/nesparovane/email/${row.id}`}>Vyřešit</Link></td></NavigableTableRow>) : <tr><td colSpan={8} className="table-empty">Žádné e-mailové notifikace nečekají na ruční zásah.</td></tr>}</tbody></table></div></div>
    <section className="ignored-bank-section"><div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Ostatní příchozí bankovní notifikace</h2><p>Posledních 100 příjmů mimo nájemní evidenci. Nejsou součástí pracovní fronty ani počtu Celkem k řešení.</p></div></div><div className="table-wrap"><table><thead><tr><th>Přijato</th><th>Nemovitost</th><th>Banka</th><th>Částka</th><th>Plátce</th><th>VS</th><th>Důvod ignorování</th></tr></thead><tbody>{ignored.length?ignored.map((row)=><tr className="ignored-bank-row" key={row.id}><td>{date(row.receivedAt)}</td><td>{row.property?.name||"—"}</td><td>{bankNameForCode(row.bank)}{row.bank&&row.bank!=="UNKNOWN"?` · ${row.bank}`:""}</td><td className="money">{row.amountCents?money(row.amountCents):"—"}</td><td>{row.counterpartyName||"—"}<span className="owner-sub">{row.counterpartyAccount}</span></td><td>{row.variableSymbol||"—"}</td><td>{row.parseNote||"Ignorováno mimo nájemní evidenci."}</td></tr>):<tr><td colSpan={7} className="table-empty">Žádné ignorované bankovní notifikace.</td></tr>}</tbody></table></div></div></section>
    <section className="irrelevant-email-section"><details><summary>Nerelevantní e-maily <span>{irrelevantEmails.length}</span></summary><div className="card portfolio-table-card"><div className="table-toolbar"><div><h2>Nerelevantní e-maily</h2><p>Obecné zprávy bez smysluplných bankovních nebo platebních znaků. Nejsou součástí pracovní fronty.</p></div></div><div className="table-wrap"><table><thead><tr><th>Přijato</th><th>Odesílatel</th><th>Předmět</th><th>Důvod</th><th></th></tr></thead><tbody>{irrelevantEmails.length?irrelevantEmails.map((row)=><NavigableTableRow href={`/platby/nesparovane/email/${row.id}`} ariaLabel="Otevřít e-mail" className="irrelevant-email-row" key={row.id}><td>{date(row.receivedAt)}</td><td>{row.sender||"—"}</td><td>{row.subject||"Bez předmětu"}</td><td>{row.parseNote}</td><td><Link className="table-link" href={`/platby/nesparovane/email/${row.id}`}>Detail</Link></td></NavigableTableRow>):<tr><td colSpan={5} className="table-empty">Žádné nerelevantní e-maily.</td></tr>}</tbody></table></div></div></details></section>
  </div></Shell>;
}

function QueueStat({label,value,bad=false}:{label:string;value:string;bad?:boolean}) { return <div className="card stat"><div><span>{label}</span><strong className={bad?"negative":""}>{value}</strong><small className={bad?"bad":""}>položek</small></div></div>; }
