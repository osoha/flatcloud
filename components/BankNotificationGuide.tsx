"use client";

import { BankConnectionWizard } from "./BankConnectionWizard";
import { useState } from "react";
import Image from "next/image";

import { bankNotificationGuides as banks, otherNotificationBanks as otherBanks } from "@/lib/bank-notification-guides";
import { BankNotificationPrivacy } from "./BankMailForwardingGuide";

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return <li className="bank-onboarding-step"><span className="step-number">{number}</span><div><strong>{title}</strong><div className="muted-copy">{children}</div></div></li>;
}

export function BankNotificationGuide({ mailbox, includeAssignment = false, accountBankCodes = [] }: {
  mailbox: string;
  includeAssignment?: boolean;
  accountBankCodes?: string[];
}) {
  const uniqueCodes = [...new Set(accountBankCodes.filter(Boolean))];
  const [selectedCode, setSelectedCode] = useState(uniqueCodes.length === 1 ? uniqueCodes[0] : "");
  const bank = banks.find((item) => item.code === selectedCode);
  const knownOther = otherBanks.find((item) => item.code === selectedCode);
  const selectedName = bank?.name || knownOther?.name || (selectedCode && selectedCode !== "OTHER" ? `Banka /${selectedCode}` : "jiná banka");
  const offset = includeAssignment ? 1 : 0;

  return <div className="owner-bank-guide"><BankConnectionWizard key={selectedCode} mailbox={mailbox} bank={bank} selectedName={selectedName} unavailableNote={knownOther?.note}/>
    <div className="bank-guide-intro">
      <Image src="/guide/finance.webp" width={82} height={82} alt="Berry provází nastavením banky"/>
      <div><strong>Berry vás provede propojením banky</strong><p>Vyberte banku účtu, na který chodí nájemné. Potom postupujte podle kroků níže.</p></div>
    </div>
    <label className="field bank-guide-select"><span>Banka pro tento účet</span><select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
      <option value="">Vyberte banku</option>
      {banks.map((item) => <option key={item.code} value={item.code}>{item.name} /{item.code}</option>)}
      {otherBanks.map((item) => <option key={item.code} value={item.code}>{item.name}{item.code !== "OTHER" ? ` /${item.code}` : ""}</option>)}
      {selectedCode && !banks.some((item) => item.code === selectedCode) && !otherBanks.some((item) => item.code === selectedCode) && <option value={selectedCode}>Banka /{selectedCode}</option>}
    </select></label>
    {selectedCode ? <>
      <p className="bank-guide-support manual">{bank
        ? `${bank.name}: návod vychází z nápovědy banky. Kompatibilita konkrétní zprávy je zatím orientační, dokud ji nepotvrdí testovací platba.`
        : `${selectedName}: ${knownOther?.note || "Postup ani formát zpráv této banky zatím nemáme ověřený; nejdříve kontaktujte banku a správce FlatBerry."}`}</p>
      <ol className="bank-guide-steps">
        {includeAssignment && <Step number={1} title="Přiřaďte účet k jednotce">Číslo účtu nebo IBAN vyberte u vlastnictví jednotky, na kterou chodí nájemné.</Step>}
        <Step number={1 + offset} title={bank ? `Zapněte ${bank.title}` : `Zapněte upozornění u ${selectedName}`}>
          {bank ? bank.steps[0] : "Nejdříve si u banky potvrďte dostupnost e-mailových avíz jednotlivých příchozích plateb s VS. Bez nich nelze pokračovat e-mailovým propojením."}
        </Step>
        <Step number={2 + offset} title="Nastavte doručení e-mailu">
          {bank ? `${bank.steps[1]} ` : "Zkontrolujte, že zpráva obsahuje údaje potřebné k přiřazení platby. "}
          Pokud banka nepovolí vlastní adresu příjemce, nechte zprávy chodit na e-mail vlastníka a nastavte přeposílání bankovních oznámení na <strong>{mailbox}</strong>. Pravidlo nastavte bez úprav obsahu zprávy. Pro soukromý účet omezte oznámení na konkrétní VS nájmů; postup pro svou e-mailovou službu najdete v krokovém průvodci.
        </Step>
        <Step number={3 + offset} title="Pošlete jednu testovací platbu 1 Kč">Použijte účet a variabilní symbol v bloku níže. Filtr musí dočasně propustit také tento testovací VS a částku 1 Kč. Doručení a přeposílání mohou trvat několik minut.</Step>
        <Step number={4 + offset} title="Zkontrolujte výsledek">Vyčkejte několik minut a zkontrolujte stav účtu níže. Další testovací platbu neposílejte, dokud se nevyhodnotí první.</Step>
      </ol>
      {bank && <a className="bank-guide-source" href={bank.helpUrl} target="_blank" rel="noopener noreferrer">Nápověda banky ↗</a>}
      {!bank && knownOther?.helpUrl && <a href={knownOther.helpUrl} target="_blank" rel="noopener noreferrer">Web a nápověda banky ↗</a>}
    </> : <p className="bank-guide-hint">Po výběru banky Berry ukáže odpovídající kroky.</p>}
    <BankNotificationPrivacy/>
  </div>;
}
