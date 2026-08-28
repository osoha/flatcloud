import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { findVisibleSecurityDepositLeases, securityDepositSnapshot } from "@/lib/security-deposit";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
const statusLabels={NOT_CONFIGURED:"Neevidováno",UNPAID:"Nesloženo",PARTIAL:"Částečně složeno",FUNDED:"Složeno",TO_SETTLE:"K vypořádání",SETTLED:"Vypořádáno"};
export default async function DepositsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const view = (await searchParams).view || "ACTIVE";
  const leases = await findVisibleSecurityDepositLeases(user);
  const rows = leases.map((lease) => ({ lease, snapshot: securityDepositSnapshot(lease) })).filter(({ lease, snapshot }) => view === "ALL" || view === "ACTIVE" && !["TO_SETTLE", "SETTLED"].includes(snapshot.status) || view === "SETTLE" && snapshot.status === "TO_SETTLE" || view === "SETTLED" && snapshot.status === "SETTLED");
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Kauce</h1><p>Evidence sjednaných a skutečně držených jistin v rozsahu vašich oprávnění.</p></div></div><nav className="registry-tabs">{[["ACTIVE","Aktivní"],["SETTLE","K vypořádání"],["SETTLED","Vypořádané"],["ALL","Vše"]].map(([key,label])=><Link key={key} className={`registry-tab ${view===key?"active":""}`} href={`/kauce?view=${key}`}>{label}</Link>)}</nav><div className="card table-wrap"><table className="registry-table"><thead><tr><th>Nájemník</th><th>Nemovitost / jednotka</th><th>Smlouva</th><th>Sjednáno</th><th>Drženo</th><th>Úrok p.a.</th><th>Naběhlý úrok</th><th>K vrácení</th><th>Stav</th></tr></thead><tbody>{rows.length?rows.map(({ lease, snapshot }) => <tr key={lease.id}><td><Link className="entity-primary" href={`/smlouvy/${lease.id}#kauce`}>{lease.tenant.name}</Link></td><td>{lease.unit.property.name}<span className="entity-secondary">{lease.unit.label}</span></td><td><Link href={`/smlouvy/${lease.id}#kauce`}>{lease.contractNumber || "Bez čísla"}</Link></td><td>{money(snapshot.agreedAmountCents)}</td><td>{money(snapshot.heldPrincipalCents)}</td><td>{(snapshot.currentAnnualRateBps / 100).toLocaleString("cs-CZ")} %</td><td>{money(snapshot.accruedInterestCents)}</td><td>{money(snapshot.amountToReturnCents)}</td><td><span className={`status ${snapshot.status==="FUNDED"?"ok":snapshot.status==="TO_SETTLE"?"warn":""}`}>{statusLabels[snapshot.status]}</span></td></tr>):<tr><td colSpan={9} className="table-empty">V této záložce nejsou žádné kauce.</td></tr>}</tbody></table></div></div></Shell>;
}
