"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { BankNotificationInstructions } from "@/lib/bank-notification-guides";
import { BankMailForwardingGuide, BankNotificationPrivacy } from "./BankMailForwardingGuide";

const labels = ["Banka a soukromí", "Bankovní notifikace", "Doručení oznámení", "Jedna testovací platba", "Kontrola doručení", "Hotovo"];

export function BankConnectionWizard({ mailbox, bank, selectedName, unavailableNote }: {
  mailbox: string; bank?: BankNotificationInstructions; selectedName: string; unavailableNote?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState("selected");
  const [delivery, setDelivery] = useState("forward");
  const storageKey = `flatberry-bank-guide:v2:${mailbox}:${selectedName}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Number.isInteger(saved.step) && saved.step >= 0 && saved.step < labels.length) {
        setStep(saved.step);
        setScope(saved.scope === "incoming" ? "incoming" : "selected");
        setDelivery(saved.delivery === "direct" ? "direct" : "forward");
      }
    } catch { /* Browser storage is optional. */ }
  }, [storageKey]);
  function advance(next: number) {
    setStep(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ step: next, scope, delivery })); } catch { /* Optional progress only. */ }
  }
  return <>
    <button type="button" className="secondary" onClick={() => ref.current?.showModal()}>Spustit krokového průvodce s Berrym</button>
    <dialog ref={ref} className="bank-wizard" aria-label="Berryho průvodce propojením banky">
      <div className="card-head"><strong>Krok {step + 1} z {labels.length} · {selectedName}</strong><button type="button" className="secondary" onClick={() => ref.current?.close()} aria-label="Zavřít průvodce">Zavřít</button></div>
      <progress value={step + 1} max={labels.length} aria-label="Průběh průvodce"/>
      <div className="bank-guide-intro"><Image src="/guide/finance.webp" width={100} height={120} alt="Berry vás provede připojením banky"/><h2>{labels[step]}</h2></div>
      {step === 0 && <>
        <p>Vybraný účet patří bance {selectedName}. Pokud banka nesouhlasí, zavřete průvodce a změňte ji ve výběru.</p>
        <label className="field"><span>Které platby chcete sdílet?</span><select value={scope} onChange={event => setScope(event.target.value)}><option value="selected">Jen nájemné s vybranými VS — doporučeno pro soukromý účet</option><option value="incoming">Všechny příchozí platby — pro samostatný účet nájemného</option></select></label>
        {scope === "selected" ? <p>Vyberte konkrétní variabilní symboly nájmů. Pouhé „má vyplněný VS“ může zahrnout i vaše soukromé příjmy. Při novém nájmu aktualizujte pravidlo; platbu s chybným nebo chybějícím VS bude potřeba dohledat v bance.</p> : <p>Tato varianta sdílí všechny příchozí platby vybraného účtu, včetně případných soukromých příjmů. Odchozí platby pro evidenci nájemného nejsou potřeba.</p>}
        <label className="field"><span>Jak budou oznámení doručována?</span><select value={delivery} onChange={event => setDelivery(event.target.value)}><option value="forward">Přes filtr v mé e-mailové schránce</option><option value="direct">Přímo z banky na adresu FlatBerry</option></select></label>
        <p>Přímé doručení použijte, pokud banka dovoluje samostatnou adresu pro tato avíza{scope === "selected" ? " a umí je omezit na vybrané VS" : ""}. Hlavní kontaktní e-mail pro zabezpečení bankovnictví neměňte na adresu FlatBerry.</p>
        <BankNotificationPrivacy/>
      </>}
      {step === 1 && <>
        <p>{bank ? `${bank.name}: ${bank.title}.` : unavailableNote || "U této banky nemáme ověřený postup. Nejdříve u banky potvrďte možnost e-mailových avíz příchozí platby s VS."}</p>
        {bank && <><ol>{bank.steps.map(instruction => <li key={instruction}>{instruction}</li>)}</ol><a href={bank.helpUrl} target="_blank" rel="noopener noreferrer">Oficiální nápověda banky ↗</a></>}
        <p>{scope === "selected" ? "Pokud banka podporuje filtr konkrétního VS, nastavte jej už zde. Pokud jej neumí, doručujte na vlastní schránku a filtrujte tam." : "Zapněte pouze příchozí platby účtu nájemného."} Potřebujeme jednotlivá avíza s částkou, účtem a VS; měsíční výpis ani push oznámení nestačí.</p>
        <p>Postup z nápovědy banky neznamená ověřenou kompatibilitu zpráv ve FlatBerry. Tu potvrdí až výsledek testu.</p>
      </>}
      {step === 2 && (delivery === "forward" ? <BankMailForwardingGuide mailbox={mailbox} selectedOnly={scope === "selected"}/> : <>
        <p>Do příjemce vybraných bankovních avíz zadejte <strong>{mailbox}</strong>. Přeposílání ze své pošty pro tuto cestu nepotřebujete.</p>
        <p>{scope === "selected" ? "Zkontrolujte, že pravidlo v bance propouští jen příchozí platby s konkrétními VS nájmů. Pokud takový filtr banka nenabízí, vraťte se na první krok a vyberte doručení přes svou schránku." : "Zkontrolujte vybraný účet a omezení na příchozí platby."} Pokud lze vynechat zůstatek, vypněte jeho zasílání.</p>
      </>)}
      {step === 3 && <>
        <p>Pošlete jednu platbu 1 Kč podle QR a testovacího VS v bloku bankovního účtu. Další platbu neposílejte, než se vyhodnotí první.</p>
        <p>Test má vlastní VS. {scope === "selected" ? "Dočasně jej přidejte do filtru v bance i v e-mailu, kde filtrujete. " : ""}Zkontrolujte, že minimální částka oznámení propustí 1 Kč. Pokud to banka neumožňuje, test neodesílejte a obraťte se na správce FlatBerry.</p>
      </>}
      {step === 4 && <>
        <p>Počkejte několik minut a zkontrolujte stav účtu. Tlačítko „Odeslal jsem testovací platbu“ je v bloku účtu. Průvodce sám platbu nezpracovává.</p>
        <p>Pokud oznámení nedorazilo, zkontrolujte původní zprávu, spam, potvrzení přeposílání a podmínky filtru. Nevypínejte všechny filtry kvůli testu. Pokud zpráva dorazila, ale platba se nerozpoznala, požádejte správce o kontrolu formátu.</p>
      </>}
      {step === 5 && <>
        <p>Nastavení jste prošli. Propojení je potvrzené až podle skutečného výsledku testovací platby v bloku účtu.</p>
        {scope === "selected" && <p>Po úspěšném testu odstraňte dočasnou výjimku pro testovací VS. První skutečné nájemné ještě ověřte; testovací zpráva sama nepotvrdí správnost všech VS ve filtru.</p>}
      </>}
      <div className="action-row"><button type="button" className="secondary" disabled={!step} onClick={() => advance(step - 1)}>Zpět</button>{step < labels.length - 1 ? <button type="button" className="primary" onClick={() => advance(step + 1)}>Pokračovat</button> : <button type="button" className="primary" onClick={() => ref.current?.close()}>Zavřít</button>}</div>
    </dialog>
  </>;
}
