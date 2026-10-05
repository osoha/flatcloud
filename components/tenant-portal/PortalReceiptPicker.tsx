"use client";

import {useId, useState} from "react";
import Link from "next/link";
import {Download, Info} from "lucide-react";

type ReceiptChoice = {id: string; label: string; ready: boolean; reason: string; issuerName?: string};

export function PortalReceiptPicker({tenantId, choices, preview, staffHref}: {
  tenantId: string; choices: ReceiptChoice[]; preview: boolean; staffHref: string;
}) {
  const [selectedId, setSelectedId] = useState(() => (choices.find(choice => choice.ready) || choices[0])?.id || "");
  const selected = choices.find(choice => choice.id === selectedId);
  const statusId = useId();
  return <section className="tp-receipt-picker">
    <h3>Potvrzení o uhrazeném nájmu</h3>
    <p>Vyberte nájem plně uhrazený připsanými platbami. Doklad s podpisem se uloží do archivu a stáhne jako PDF.</p>
    {choices.length ? <>
      <form action={`/api/portal/tenants/${tenantId}/receipts`} method="post" className="tp-receipt-form">
        <label className="tp-field"><span>Zaplacený nájem</span><select name="chargeId" required value={selectedId} onChange={event => setSelectedId(event.target.value)} aria-describedby={statusId}>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
        <button className="tp-button tp-button-primary" type="submit" disabled={preview || !selected?.ready}><Download size={18}/> Vygenerovat a stáhnout PDF</button>
      </form>
      <p id={statusId} className="tp-subtle" role="status">{selected?.ready ? selected.issuerName ? `Vystavitel: ${selected.issuerName}.` : "Podpis a vystavování jsou pro toto období připravené." : selected?.reason || "Vystavování dokladu pro toto období se připravuje."}{!selected?.ready && " Již vystavené doklady zůstávají v archivu."}</p>
    </> : <div className="tp-info"><Info size={20}/><p>Zatím není evidovaný nájem plně uhrazený připsanou platbou. Doklad bude dostupný po přijetí a přiřazení platby.</p></div>}
    {preview && <p className="tp-subtle">Náhled je pouze pro čtení. Doklad můžete vystavit v <Link href={staffHref}>detailu jednotky → Doklady o zaplacení</Link>.</p>}
  </section>;
}
