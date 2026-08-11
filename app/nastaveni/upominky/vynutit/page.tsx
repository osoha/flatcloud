import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money, date } from "@/lib/format";
import { previewForceRentNotifications, type NotificationRunResult } from "@/lib/rent-notifications";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";

type StoredForceResult = { result?: NotificationRunResult };

export default async function ForceReminderPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; done?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [preview, query] = await Promise.all([previewForceRentNotifications(new Date()), searchParams]);
  const latestAudit = query.done ? await prisma.auditLog.findFirst({ where: { userId: user.id, action: "RENT_NOTIFICATIONS_FORCED" }, orderBy: { createdAt: "desc" } }) : null;
  const stored = latestAudit?.details as unknown as StoredForceResult | null;
  const result = stored?.result;

  return <Shell user={user}><div className="page form-page">
    <div className="breadcrumb"><Link href="/nastaveni">← Zpět do administrace</Link></div>
    <div className="page-title"><div><h1>Vynucené rozeslání upomínek</h1><p>Ruční zásah mimo běžný kalendář. Již úspěšně odeslaný stupeň se znovu nepošle.</p></div></div>
    <Flash ok={query.ok} error={query.error}/>

    <div className="detail-grid">
      <div className="card col-5"><h2>Co se stane</h2><div className="summary-list">
        <div><span>Smlouvy připravené k odeslání</span><strong>{preview.leaseCount}</strong></div>
        <div><span>Neuhrazené předpisy</span><strong>{preview.chargeCount}</strong></div>
        <div><span>Celkový otevřený dluh</span><strong>{money(preview.outstandingCents)}</strong></div>
      </div><div className="notice" style={{marginTop:16}}>Vynucení ignoruje počet dní nastavený pro 1. a 2. upomínku. U každé smlouvy odešle pouze nejbližší dosud neodeslaný stupeň. Respektuje uhrazené předpisy i individuální pozastavení upomínek.</div></div>
      <div className="card col-7"><h2>Potvrzení</h2><p className="muted-copy">Tuto akci použijte například po výpadku cron jobu nebo pokud chcete upomínku odeslat dříve než podle standardního kalendáře.</p>
        <form action="/api/settings/notifications/force" method="post" className="compact-form">
          <label className="checkbox-field"><input type="checkbox" name="confirm" required/><span>Potvrzuji vynucené odeslání níže uvedeným příjemcům.</span></label>
          <button className="primary" type="submit" disabled={!preview.candidates.length}>Vynutit rozeslání {preview.leaseCount ? `(${preview.leaseCount})` : ""}</button>
        </form>
      </div>
    </div>

    <div className="card portfolio-table-card" style={{marginTop:20}}><div className="card-head"><div><h2>Náhled před odesláním</h2><p className="muted-copy">Aktuální stav v okamžiku otevření stránky. Před samotným odesláním server kandidáty zkontroluje znovu.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Nájemník</th><th>Nejstarší splatnost</th><th>Po splatnosti</th><th>Předpisy</th><th>Dluh</th><th>Odešle se</th><th>Příjemce</th></tr></thead><tbody>
        {preview.candidates.length ? preview.candidates.map((item)=><tr key={item.leaseId}><td><strong>{item.property}</strong><small style={{display:"block"}}>{item.unit}</small></td><td>{item.tenant}</td><td>{date(item.oldestDueDate)}</td><td>{item.daysOverdue} dní</td><td>{item.chargeCount}</td><td className="money negative">{money(item.outstandingCents)}</td><td><strong>{item.typeLabel}</strong></td><td>{item.recipient || <span className="negative">Chybí e-mail</span>}</td></tr>) : <tr><td colSpan={8} className="table-empty">Není žádná neuhrazená smlouva s dalším stupněm upomínky k vynucení.</td></tr>}
      </tbody></table></div>
    </div>

    {result && <div className="card portfolio-table-card" style={{marginTop:20}}><div className="card-head"><div><h2>Výsledek posledního vynuceného rozeslání</h2><p className="muted-copy">{result.summary}</p></div></div><div className="table-wrap"><table><thead><tr><th>Nemovitost / jednotka</th><th>Nájemník</th><th>Typ</th><th>Příjemce</th><th>Částka</th><th>Výsledek</th><th>Detail</th></tr></thead><tbody>
      {result.items.length ? result.items.map((item, index)=><tr key={`${item.leaseId}-${item.type}-${index}`}><td><strong>{item.property}</strong><small style={{display:"block"}}>{item.unit}</small></td><td>{item.tenant}</td><td>{item.typeLabel}</td><td>{item.recipient || "—"}</td><td className="money">{money(item.outstandingCents)}</td><td><span className={`status ${item.status === "sent" ? "ok" : item.status === "failed" ? "bad" : item.status === "skipped" ? "warn" : ""}`}>{item.status === "sent" ? "Odesláno" : item.status === "failed" ? "Chyba" : item.status === "skipped" ? "Přeskočeno" : "Již odesláno"}</span></td><td>{item.detail || "—"}</td></tr>) : <tr><td colSpan={7} className="table-empty">Běh nevytvořil žádné zprávy.</td></tr>}
    </tbody></table></div></div>}
  </div></Shell>;
}
