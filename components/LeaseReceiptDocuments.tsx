import { HistoryTable } from "./HistoryTable";
import Link from "next/link";
import { previewContext } from "@/lib/auth";
import type { ReceiptActor } from "@/lib/owner-receipt-settings";
import { getLeaseReceiptDocuments, receiptIssuerStatusForLease } from "@/lib/tenant-payment-receipts";
import { periodLabel } from "@/lib/period";
import { dateTime } from "@/lib/format";
import styles from "./ReceiptSettings.module.css";

export async function LeaseReceiptDocuments({ user, leaseId, returnTo }: { user: ReceiptActor; leaseId: string; returnTo?: string }) {
  const [data, preview] = await Promise.all([getLeaseReceiptDocuments(user, leaseId), previewContext()]);
  if (!data) return null;
  const canManage = data.canManage && !preview.requested;
  const destination = returnTo || `/smlouvy/${leaseId}#doklady`;
  const eligibleCharges = data.charges.filter(charge => charge.eligible);
  const periodStatuses = await Promise.all(data.periods.map(async period => ({ period, status: await receiptIssuerStatusForLease(leaseId, period.fromPeriod) })));
  const activePeriods = periodStatuses.filter(({ period }) => period.active);
  const needsSetup = !activePeriods.length || activePeriods.some(({ status }) => !status.ready);

  const renderReceipt = (receipt: typeof data.receipts[number]) => <li key={receipt.id}><div><strong>{periodLabel(receipt.period)}</strong><span className={styles.meta}>{receipt.issuerName}{receipt.signerName ? ` · ${receipt.signerName}` : ""}</span><span className={styles.meta}>Vystaveno {dateTime(receipt.issuedAt)}</span>{!receipt.chargeActive && <span className="status warn">Původní předpis je neaktivní</span>}</div>{preview.requested ? <span className={styles.meta}>PDF je dostupné ve vlastním účtu.</span> : <a className="secondary" href={`/api/leases/${leaseId}/receipts/${receipt.id}`}>Stáhnout PDF</a>}</li>;
  return <section className={`card ${styles.lease}`} aria-labelledby={`receipt-lease-${leaseId}`}>
    <div className={styles.header}><div><h3 id={`receipt-lease-${leaseId}`}>Doklady o zaplacení · {data.tenantName}</h3><p className={styles.note}>{data.contractNumber || "Nájemní smlouva"} · PDF můžete stáhnout pro nájemníka i ze správy jednotky.</p></div><span className={`status ${needsSetup ? "warn" : "ok"}`}>{needsSetup ? "Doplnit vystavitele" : "Vystavitel nastaven"}</span></div>

    <details className="create-panel" open={needsSetup}>
      <summary>Kdo vystavuje doklady</summary>
      <p className={styles.note}>U nových smluv se pronajímatel a jeho účet přebírají při založení z vybraného vlastníka jednotky. Platí bez koncového měsíce. U starší smlouvy bez této vazby jej potvrďte jednou; další období založte jen při změně pronajímatele.</p>
      <div className={styles.periods}>
        {periodStatuses.map(({ period, status }) => <div className={styles.period} key={period.id}>
          <div className={styles.header}><div><strong>{period.owner.name}</strong><span className={styles.meta}>{periodLabel(period.fromPeriod)} – {period.toPeriod ? periodLabel(period.toPeriod) : "bez konce"}</span>{period.active && <span className={styles.meta}>Podepisuje: {status.signerName || "zatím neurčeno"}</span>}</div><span className={`status ${!period.active ? "neutral" : status.ready ? "ok" : "warn"}`}>{!period.active ? "Neaktivní období" : status.ready ? "Připraveno" : "Vyžaduje doplnění"}</span></div>
          {period.active && <p className={styles.note}>{status.reason}</p>}
          {canManage && (["SUPER_ADMIN", "MANAGER"].includes(user.role) || data.ownerChoices.some(owner => owner.id === period.ownerId && owner.canViewSettings)) ? <div className={styles.actions}><Link className="secondary" href={`/vlastnici/${period.ownerId}/doklady`}>Údaje a podpisy pronajímatele</Link></div> : period.active && !status.ready && <p className={styles.note}>Údaje a podpis doplní oprávněná osoba pronajímatele ve svém nastavení dokladů.</p>}
          {canManage && <details className="create-panel"><summary>Změna pronajímatele nebo oprava období</summary><form className={styles.form} action={`/api/leases/${leaseId}/landlord`} method="post">
            <input type="hidden" name="action" value="update"/><input type="hidden" name="periodId" value={period.id}/><input type="hidden" name="revision" value={period.updatedAt.toISOString()}/><input type="hidden" name="returnTo" value={destination}/>
            <div className={styles.fields}>
              <label className="field"><span>Smluvní pronajímatel</span><select name="ownerId" defaultValue={period.ownerId} required>{!data.ownerChoices.some(owner => owner.id === period.ownerId) && <option value={period.ownerId}>{period.owner.name}</option>}{data.ownerChoices.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label>
              <label className="field"><span>Od období včetně</span><input type="month" name="fromPeriod" defaultValue={period.fromPeriod} required/></label>
              <label className="field"><span>Do období včetně</span><input type="month" name="toPeriod" defaultValue={period.toPeriod || ""}/></label>
            </div>
            <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={period.active}/><span>Platné potvrzené přiřazení pronajímatele</span></label>
            <small>Prázdný konec znamená bez časového omezení. Při změně pronajímatele nejprve ukončete původní období, pak přidejte nové.</small>
            <button className="secondary" type="submit">Potvrdit změnu přiřazení</button>
          </form></details>}
        </div>)}
      </div>
      {!activePeriods.length && <p className={styles.note}>Pronajímatel pro období nájmu zatím není potvrzený. Samotné vlastnictví jednotky ani účet pro inkaso tuto volbu nenahrazují.</p>}
      {canManage && <details className="create-panel" open={!activePeriods.length}><summary>{activePeriods.length ? "Přidat nového pronajímatele po změně" : "Potvrdit smluvního pronajímatele pro celý nájem"}</summary><form className={styles.form} action={`/api/leases/${leaseId}/landlord`} method="post">
        <input type="hidden" name="action" value="add"/><input type="hidden" name="active" value="on"/><input type="hidden" name="returnTo" value={destination}/>
        <div className={styles.fields}>
          <label className="field"><span>Smluvní pronajímatel</span><select name="ownerId" defaultValue="" required><option value="" disabled>Vyberte podle smlouvy</option>{data.ownerChoices.map(owner => <option value={owner.id} key={owner.id}>{owner.name}</option>)}</select></label>
          <label className="field"><span>Od období včetně</span><input type="month" name="fromPeriod" defaultValue={activePeriods.length ? "" : data.initialPeriod} required/></label>
          <label className="field"><span>Do období včetně</span><input type="month" name="toPeriod"/></label>
        </div>
        <small>Pronajímatel platí od počátku nájmu bez konce. Konec vyplňte teprve při změně smluvní strany. Již vystavené doklady se nepřepisují.</small>
        <button className="primary" type="submit" disabled={!data.ownerChoices.length}>Potvrdit pronajímatele pro období</button>
        {!data.ownerChoices.length && <p className={styles.note}>Pro tuto správu není dostupný žádný pronajímatel. Požádejte správce aplikace o doplnění vlastníka.</p>}
      </form></details>}
      {!canManage && needsSetup && <p className={styles.note}>Nastavení doplní uživatel s oprávněním spravovat tuto jednotku a údaje pronajímatele.</p>}
    </details>

<HistoryTable columns={4} historyLabel="Starší uhrazené nájmy" empty="Zatím tu není nájem plně uhrazený připsanými platbami." headers={<><th>Uhrazený nájem</th><th>Částka</th><th>Vystavitel a podpis</th><th>Doklad</th></>} rows={eligibleCharges.map(charge => <tr key={charge.id}>
        <td data-label="Nájem">{periodLabel(charge.period)}</td><td data-label="Částka"><strong>{new Intl.NumberFormat("cs-CZ", { style: "currency", currency: charge.currency }).format(charge.amountCents / 100)}</strong></td>
        <td data-label="Vystavitel"><div><strong>{charge.issuerStatus.issuerName || "Pronajímatel zatím nepotvrzen"}</strong>{charge.issuerStatus.signerName && <span className={styles.meta}>{charge.issuerStatus.signerName}</span>}{!charge.issuerStatus.ready && <span className={styles.meta}>{charge.issuerStatus.reason}</span>}</div></td>
        <td data-label="Doklad">{canManage ? <form action={`/api/leases/${leaseId}/receipts`} method="post"><input type="hidden" name="chargeId" value={charge.id}/><input type="hidden" name="returnTo" value={destination}/><button className="secondary" type="submit" disabled={!charge.issuerStatus.ready}>Vystavit a stáhnout PDF</button></form> : <span className={styles.meta}>{preview.requested ? "Vystavení je dostupné ve vlastním účtu." : "Vystavení vyžaduje oprávnění upravovat jednotku."}</span>}</td>
      </tr>)}/>

    <details className="create-panel" open={data.receipts.length > 0}><summary>Vystavené doklady ({data.receipts.length})</summary><p className={styles.note}>Archiv obsahuje původní PDF se stavem úhrad a podpisem v okamžiku vystavení.</p><ul className={styles.list}>{data.receipts.slice(0, 10).map(renderReceipt)}</ul>{data.receipts.length > 10 && <details className="history-disclosure"><summary>Starší vystavené doklady ({data.receipts.length - 10})</summary><ul className={styles.list}>{data.receipts.slice(10).map(renderReceipt)}</ul></details>}{!data.receipts.length && <p className={styles.note}>Žádný doklad zatím nebyl vystaven.</p>}</details>
  </section>;
}
