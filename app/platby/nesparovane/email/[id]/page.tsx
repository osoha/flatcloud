import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { date, money } from "@/lib/format";
import { Shell } from "@/components/Shell";
import { Flash, FormPage } from "@/components/FormUi";

export const dynamic = "force-dynamic";

export default async function InboxPaymentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const { id } = await params;
  const [row, leases, query] = await Promise.all([
    prisma.inboxPayment.findUnique({ where: { id } }),
    prisma.lease.findMany({ where: { status: { in: ["ACTIVE", "FUTURE"] }, unit: { property: { active: true } } }, include: { unit: { include: { property: true } }, tenant: true, ownerBankAccount: true }, orderBy: [{ unit: { property: { name: "asc" } } }, { unit: { label: "asc" } }] }),
    searchParams,
  ]);
  if (!row) notFound();
  return <Shell user={user}><FormPage title="RB e-mail – ruční spárování" description="Sběrný e-mail bankovních notifikací" backHref="/platby/nesparovane">
    <Flash ok={query.ok} error={query.error}/>
    <div className="detail-grid">
      <div className="card col-7"><h2>Rozpoznaná platba</h2><div className="summary-list"><div><span>Přijato</span><strong>{date(row.receivedAt)}</strong></div><div><span>Datum platby</span><strong>{row.bookedAt ? date(row.bookedAt) : "—"}</strong></div><div><span>Částka</span><strong>{row.amountCents ? money(row.amountCents) : "—"}</strong></div><div><span>Cílový účet</span><strong>{row.recipientAccount || "—"}</strong></div><div><span>Plátce</span><strong>{row.counterpartyName || "—"}</strong></div><div><span>Účet plátce</span><strong>{row.counterpartyAccount || "—"}</strong></div><div><span>VS / SS / KS</span><strong>{[row.variableSymbol && `VS ${row.variableSymbol}`, row.specificSymbol && `SS ${row.specificSymbol}`, row.constantSymbol && `KS ${row.constantSymbol}`].filter(Boolean).join(" · ") || "—"}</strong></div><div><span>Zpráva</span><strong>{row.message || "—"}</strong></div><div><span>Parser</span><strong>{row.parseNote || "—"}</strong></div></div></div>
      <div className="card col-5"><h2>Přiřadit ke smlouvě</h2><p className="muted-copy">Tím vznikne standardní bankovní transakce v objektu a částka se automaticky rozpočítá na nejstarší otevřené předpisy vybrané smlouvy.</p>{row.amountCents && row.amountCents > 0 ? <form className="compact-form" action={`/api/inbound-payments/${row.id}/assign`} method="post"><label className="field"><span>Smlouva</span><select name="leaseId" required defaultValue=""><option value="" disabled>Vyberte objekt / jednotku / nájemníka</option>{leases.map((lease) => <option value={lease.id} key={lease.id}>{lease.unit.property.name} · {lease.unit.label} · {lease.tenant.name} · VS {lease.variableSymbol}</option>)}</select></label><button className="primary" type="submit">Přiřadit a zaúčtovat</button></form> : <div className="notice">E-mail nemá rozpoznanou kladnou částku a nelze ho zaúčtovat.</div>}<form action={`/api/inbound-payments/${row.id}/ignore`} method="post" style={{marginTop:14}}><button className="danger-button" type="submit">Označit jako nerelevantní</button></form></div>
      <div className="card col-12"><h2>Původní obsah</h2><pre className="email-raw">{row.rawExcerpt || row.subject || "Obsah není k dispozici."}</pre></div>
    </div>
  </FormPage></Shell>;
}
