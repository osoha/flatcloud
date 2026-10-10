import {randomUUID} from "node:crypto";
import Link from "next/link";
import {notFound} from "next/navigation";
import {Plus, WalletCards} from "lucide-react";
import {requireUser} from "@/lib/auth";
import {prisma} from "@/lib/db";
import {Shell} from "@/components/Shell";
import {PageHeading} from "@/components/PageHeading";
import {Flash} from "@/components/FormUi";
import {ExpandableSection} from "@/components/ExpandableSection";
import {BankVerificationPayment} from "@/components/BankVerificationPayment";
import {BankNotificationGuide} from "@/components/BankNotificationGuide";
import {BankAccountChangeForm} from "@/components/BankAccountChangeForm";
import {bankOwnerScope, bankAccountReadScope} from "@/lib/bank-account-permissions";
import {changeableBankUnits, bankUnitRevision} from "@/lib/bank-account-changes";
import {ownerBankAccountLabel} from "@/lib/owner-bank-account";
import {verificationCodeForAccount} from "@/lib/bank-email-verification";
import {businessDateKey} from "@/lib/calendar";
import {leaseStatusAt} from "@/lib/lease-lifecycle-core";
import {appSettings} from "@/lib/settings";

export const dynamic = "force-dynamic";
type Query = {unitId?: string; accountId?: string; ownerId?: string; propertyId?: string; q?: string; bank?: string; state?: string; verified?: string; page?: string; ok?: string; error?: string};
const stateLabels: Record<string, string> = {AVAILABLE: "Dostupný", RECEIPTS_ONLY: "Dobíhající platby", ARCHIVED: "Archivovaný"};
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs");

export default async function BankAccounts({searchParams}: {searchParams: Promise<Query>}) {
  const user = await requireUser(), query = await searchParams;
  const [units, accounts, owners, settings] = await Promise.all([
    changeableBankUnits(user),
    prisma.ownerBankAccount.findMany({where: bankAccountReadScope(user), include: {owner: {select: {name: true}}}, orderBy: [{owner: {name: "asc"}}, {createdAt: "asc"}, {id: "asc"}]}),
    prisma.owner.findMany({where: {active: true, ...bankOwnerScope(user)}, select: {id: true, name: true}, orderBy: {name: "asc"}}),
    appSettings(),
  ]);
  if (query.unitId && !units.some(unit => unit.id === query.unitId)) notFound();
  if (query.accountId && !accounts.some(account => account.id === query.accountId)) notFound();
  if (query.ownerId && !owners.some(owner => owner.id === query.ownerId) && !accounts.some(account => account.ownerId === query.ownerId)) notFound();
  const selected = units.find(unit => unit.id === query.unitId);
  const ownerId = selected?.ownerships[0]?.ownerId || query.ownerId || (owners.length === 1 ? owners[0].id : undefined);
  const filterOwner = selected?.ownerships[0]?.ownerId || query.ownerId || "";
  const propertyOptions = [...new Map(units.map(unit => [unit.propertyId, unit.property.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  const usage = (account: typeof accounts[number]) => account.active ? account.usageState : "ARCHIVED";
  const unitsByAccount = new Map<string, typeof units>();
  for (const unit of units) for (const accountId of new Set(unit.ownerships.flatMap(row => row.ownerBankAccountId ? [row.ownerBankAccountId] : []))) {
    const rows = unitsByAccount.get(accountId) || [];
    rows.push(unit); unitsByAccount.set(accountId, rows);
  }
  const linkedUnits = (id: string) => unitsByAccount.get(id) || [];
  const needle = fold((query.q || "").slice(0, 200).trim());
  const filtered = accounts.filter(account => (!filterOwner || account.ownerId === filterOwner)
    && (!query.propertyId || linkedUnits(account.id).some(unit => unit.propertyId === query.propertyId))
    && (!query.bank || account.bankCode === query.bank)
    && (!query.state || usage(account) === query.state)
    && (!query.verified || Boolean(account.notificationVerifiedAt) === (query.verified === "yes"))
    && (!needle || fold([account.owner.name, account.label, account.accountNumber, account.bankCode, account.iban, ...linkedUnits(account.id).map(unit => unit.property.name + " " + unit.label)].filter(Boolean).join(" ")).includes(needle)));
  const pageSize = 20, pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const targetIndex = query.accountId ? filtered.findIndex(account => account.id === query.accountId) : -1;
  const page = Math.min(pages, Math.max(1, Number.parseInt(query.page || String(targetIndex < 0 ? 1 : Math.floor(targetIndex / pageSize) + 1), 10) || 1));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const banks = [...new Set(accounts.map(account => account.bankCode).filter((code): code is string => Boolean(code)))].sort();
  const formUnits = units.filter(unit => (!filterOwner || unit.ownerships.some(ownership => ownership.ownerId === filterOwner)) && (!query.propertyId || unit.propertyId === query.propertyId));
  const changes = await prisma.bankAccountChange.findMany({where: {units: {some: {unitId: {in: formUnits.map(unit => unit.id)}}, every: {unitId: {in: units.map(unit => unit.id)}}}}, select: {id: true, effectiveAt: true, status: true}, orderBy: {createdAt: "desc"}, take: 25});
  const formAccounts = accounts.filter(account => !filterOwner || account.ownerId === filterOwner);
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    for (const key of ["unitId", "ownerId", "propertyId", "q", "bank", "state", "verified"] as const) if (query[key]) params.set(key, query[key]!);
    params.set("page", String(next));
    return "/bankovni-ucty?" + params + "#seznam-uctu";
  };
  return <Shell user={user}><div className="page bank-accounts-page">
    <div className="page-title"><div><PageHeading>{selected ? `Účet pro nájemné · ${selected.label}` : "Bankovní účty"}</PageHeading><p>{selected ? selected.property.name + " · " : ""}Spravujte účty, jejich použití u jednotek a ověření bankovních notifikací.</p>{selected && <Link className="table-link" href={`/nemovitosti/${selected.propertyId}/jednotky/${selected.id}`}>← Zpět na jednotku</Link>}</div><div className="action-row"><a className="secondary" href="#zmena-uctu"><WalletCards size={16}/> Změnit účet jednotek</a><a className="primary" href="#pridat-ucet"><Plus size={16}/> Přidat účet</a></div></div>
    <Flash ok={query.ok} error={query.error}/>
    <form className="card bank-account-filters" action="/bankovni-ucty" method="get" aria-label="Filtry bankovních účtů">
      {query.unitId && <input type="hidden" name="unitId" value={query.unitId}/>}
      <label className="field bank-account-search"><span>Hledat účet</span><input name="q" defaultValue={query.q || ""} maxLength={200} placeholder="Vlastník, název, číslo účtu nebo nemovitost…"/></label>
      <label className="field"><span>Filtrovat vlastníka</span><select name="ownerId" defaultValue={filterOwner}>{!selected && <option value="">Všichni dostupní vlastníci</option>}{owners.filter(owner => !selected || owner.id === filterOwner).map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
      <label className="field"><span>Nemovitost</span><select name="propertyId" defaultValue={query.propertyId || ""}><option value="">Všechny dostupné</option>{propertyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="field"><span>Banka</span><select name="bank" defaultValue={query.bank || ""}><option value="">Všechny banky</option>{banks.map(code => <option key={code} value={code}>/{code}</option>)}</select></label>
      <label className="field"><span>Používání</span><select name="state" defaultValue={query.state || ""}><option value="">Všechny stavy</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>Ověření notifikací</span><select name="verified" defaultValue={query.verified || ""}><option value="">Všechny účty</option><option value="yes">Ověřené</option><option value="no">Čekají na ověření</option></select></label>
      <div className="bank-filter-actions"><button className="secondary" type="submit">Filtrovat</button><Link className="table-link" href={query.unitId ? `/bankovni-ucty?unitId=${query.unitId}` : "/bankovni-ucty"}>Zrušit filtry</Link></div>
    </form>
    <div className="stat-grid bank-account-stats"><div className="card stat"><div><span>Účty ve výběru</span><strong>{filtered.length}</strong></div></div><div className="card stat"><div><span>Notifikace ověřeny</span><strong>{filtered.filter(account => account.notificationVerifiedAt).length}</strong></div></div><div className="card stat"><div><span>Čekají na ověření</span><strong>{filtered.filter(account => !account.notificationVerifiedAt && usage(account) !== "ARCHIVED").length}</strong></div></div></div>
    <section className="card bank-account-list" id="seznam-uctu" aria-label="Seznam bankovních účtů"><div className="card-head"><div><h2>Přehled účtů</h2><p className="muted-copy">Zobrazeno {visible.length} z {filtered.length} účtů ve výběru. Podrobnosti a testovací QR otevřete u konkrétního účtu.</p></div></div>
      {visible.map(account => <ExpandableSection id={`ucet-${account.id}`} key={account.id} className="bank-account-row" initiallyOpen={query.accountId === account.id || Boolean(selected?.ownerships.some(ownership => ownership.ownerBankAccountId === account.id))}
        summary={<><span className="bank-account-identity"><strong>{ownerBankAccountLabel(account)}</strong><small>{account.owner.name}</small></span><span className="bank-account-use">{linkedUnits(account.id).length ? `${linkedUnits(account.id).length} jednotek` : "Připravený účet"}<small>{stateLabels[usage(account)]}</small></span><span className={`status ${account.notificationVerifiedAt ? "ok" : "warn"}`}>{account.notificationVerifiedAt ? "Notifikace ověřeny" : "Čeká na ověření"}</span><span className="bank-account-expand" aria-hidden="true">Podrobnosti</span></>}>
        <BankVerificationPayment account={account} variableSymbol={verificationCodeForAccount(account.id)} units={linkedUnits(account.id).map(unit => unit.property.name + " · " + unit.label)} verified={Boolean(account.notificationVerifiedAt)}/>
        <form action={`/api/bank-accounts/${account.id}/check`} method="post"><input type="hidden" name="returnUnitId" value={query.unitId || ""}/><button className="secondary" type="submit">Odeslal/a jsem testovací platbu – zkontrolovat</button></form>
        <details className="bank-account-edit"><summary>Název a používání účtu</summary><form className="form-grid" action={`/api/bank-accounts/${account.id}`} method="post"><input type="hidden" name="returnUnitId" value={query.unitId || ""}/><label className="field"><span>Název</span><input name="label" defaultValue={account.label || ""} maxLength={100}/></label><label className="field"><span>Používání</span><select name="usageState" defaultValue={account.usageState}>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p>Číslo účtu zůstává v historii. Nové číslo přidejte jako nový účet.</p><button className="secondary" type="submit">Uložit</button></form></details>
      </ExpandableSection>)}
      {!visible.length && <p className="table-empty">Ve vybraném rozsahu nejsou žádné účty. Upravte filtry nebo přidejte svůj účet.</p>}
      {pages > 1 && <nav className="pagination" aria-label="Stránky bankovních účtů">{page > 1 && <Link href={pageHref(page - 1)}>Předchozí</Link>}<span>Strana {page} z {pages}</span>{page < pages && <Link href={pageHref(page + 1)}>Další</Link>}</nav>}
    </section>
    <ExpandableSection id="zmena-uctu-panel" summary="Změnit účet pro nájemné u jednotek" initiallyOpen={Boolean(selected)}>
      <BankAccountChangeForm today={businessDateKey(new Date())} requestId={randomUUID()} initialUnitId={query.unitId} initialAccountId={query.accountId}
        accounts={formAccounts.map(account => ({id: account.id, ownerId: account.ownerId, label: account.owner.name + " · " + ownerBankAccountLabel(account), verified: Boolean(account.notificationVerifiedAt), available: account.active && account.usageState === "AVAILABLE"}))}
        units={formUnits.filter(unit => unit.ownerships.length === 1).map(unit => ({id: unit.id, ownerId: unit.ownerships[0].ownerId, label: unit.property.name + " · " + unit.label, accountLabel: unit.ownerships[0].ownerBankAccount ? ownerBankAccountLabel(unit.ownerships[0].ownerBankAccount) : "Nenastaven", revision: bankUnitRevision(unit), leases: unit.leases.filter(lease => leaseStatusAt(lease) !== "ENDED").map(lease => ({label: lease.contractNumber || "Nájemní smlouva", tenants: [lease.tenant.name, ...lease.parties.filter(party => party.role === "CONTRACTING_PARTY").map(party => party.tenant.name)].join(", ")}))}))}/>
    </ExpandableSection>
    <ExpandableSection id="pridat-ucet" summary={<><Plus size={16}/> Přidat účet</>} initiallyOpen={Boolean(selected) || !accounts.length}>
      <p>Přidání účtu nemění platební pokyny žádné jednotky.</p><form className="form-grid" action="/api/bank-accounts" method="post"><input type="hidden" name="returnUnitId" value={query.unitId || ""}/><label className="field"><span>Vlastník účtu</span><select name="ownerId" defaultValue={ownerId} required><option value="">Vyberte vlastníka</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Název účtu</span><input name="label" maxLength={100} placeholder="Např. nájemné ČSOB"/></label><label className="field"><span>Číslo účtu</span><input name="accountNumber"/></label><label className="field"><span>Kód banky</span><input name="bankCode" inputMode="numeric" maxLength={4}/></label><label className="field"><span>IBAN (volitelný)</span><input name="iban"/></label><button className="primary" type="submit">Přidat účet</button></form>
    </ExpandableSection>
    <section className="card bank-notification-panel"><h2>Propojení banky a test</h2><BankNotificationGuide mailbox={settings?.inboundMailUser || "platby@flatcloud.cz"} accountBankCodes={query.accountId ? accounts.filter(account => account.id === query.accountId).map(account => account.bankCode || "") : filtered.map(account => account.bankCode || "")}/></section>
    <ExpandableSection id="historie-uctu" summary="Historie změn účtů">{changes.length ? changes.map(change => <p key={change.id}><Link href={`/bankovni-ucty/zmeny/${change.id}`}>Účinnost {businessDateKey(change.effectiveAt)} · {({SCHEDULED: "Naplánováno", APPLIED: "Účinné", CANCELLED: "Zrušeno", BLOCKED: "Vyžaduje kontrolu"} as Record<string, string>)[change.status] || change.status}</Link></p>) : <p>Zatím žádná změna.</p>}</ExpandableSection>
  </div></Shell>;
}
