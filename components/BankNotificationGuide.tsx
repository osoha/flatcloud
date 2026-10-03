"use client";

import { useState } from "react";
import Image from "next/image";

const banks = [
  { code: "3030", name: "Air Bank", title: "Oznámení o změně zůstatku", helpUrl: "https://www.airbank.cz/co-vas-nejvic-zajima/nastaveni-upozorneni-pod-uctem/", steps: ["V aplikaci My Air otevřete Menu → Nastavení a banka → Oznámení a vyberte upozornění ke svému účtu.", "Zapněte zasílání mailem a ověřte, že zpráva o příchozí platbě obsahuje částku, účet příjemce a variabilní symbol."] },
  { code: "5500", name: "Raiffeisenbank", title: "Informuj mě", helpUrl: "https://www.rb.cz/osobni/ucty/sluzby-k-uctum/informuj-me", steps: ["V bankovnictví otevřete službu Informuj mě a vyberte účet pro nájemné.", "Nastavte e-mailová upozornění na příchozí pohyby. Zkontrolujte příjemce a pravidla pro doručování zpráv."] },
  { code: "0800", name: "Česká spořitelna", title: "Upozornění v Georgi", helpUrl: "https://www.csas.cz/cs/george-help/george-business/domovska-stranka/profile/turnover-notifications", steps: ["V George Business otevřete Profil → Profil a nastavení uživatele → Notifikace a zvolte obratové notifikace pro příchozí transakce.", "Vyberte účet pro nájemné a e-mailové doručení. V profilu musí být vyplněný pracovní e-mail; v osobním Georgi se názvy voleb mohou lišit."] },
  { code: "0300", name: "ČSOB", title: "Moje info", helpUrl: "https://www.csob.cz/lide/ucty/internetove-a-mobilni-bankovnictvi/internetove-bankovnictvi", steps: ["V bankovnictví otevřete Moje info a vyberte upozornění na zaúčtovanou platbu či pohyb na účtu.", "Zapněte e-mailové doručení pro účet nájemného a ověřte obsah zprávy."] },
] as const;

const otherBanks = [
  { code: "0100", name: "Komerční banka" }, { code: "0600", name: "MONETA Money Bank" },
  { code: "2010", name: "Fio banka" }, { code: "2700", name: "UniCredit Bank" },
  { code: "6210", name: "mBank" }, { code: "OTHER", name: "Jiná banka" },
] as const;

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

  return <div className="owner-bank-guide">
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
      <p className={`bank-guide-support ${bank ? "supported" : "manual"}`}>{bank
        ? `${bank.name}: příchozí zprávy umíme zpracovat po ověření odesílatele, obsahu a testovací platby.`
        : `${selectedName}: nastavení notifikací je orientační. Automatické zpracování zpráv této banky zatím nemá ověřený formát; po testu zkontrolujte výsledek se správcem.`}</p>
      <ol className="bank-guide-steps">
        {includeAssignment && <Step number={1} title="Přiřaďte účet k jednotce">Číslo účtu nebo IBAN vyberte u vlastnictví jednotky, na kterou chodí nájemné.</Step>}
        <Step number={1 + offset} title={bank ? `Zapněte ${bank.title}` : `Zapněte upozornění u ${selectedName}`}>
          {bank ? bank.steps[0] : "V bankovnictví najděte nastavení oznámení o pohybech na účtu a vyberte e-mailové upozornění na příchozí platby. Názvy nabídek se podle banky liší."}
        </Step>
        <Step number={2 + offset} title="Nastavte doručení e-mailu">
          {bank ? `${bank.steps[1]} ` : "Zkontrolujte, že zpráva obsahuje údaje potřebné k přiřazení platby. "}
          Pokud banka nepovolí vlastní adresu příjemce, nechte zprávy chodit na e-mail vlastníka a nastavte přeposílání bankovních oznámení na <strong>{mailbox}</strong>. Pravidlo nastavte bez úprav předmětu a těla zprávy.
        </Step>
        <Step number={3 + offset} title="Pošlete jednu testovací platbu 1 Kč">Použijte účet a variabilní symbol v bloku níže. Doručení a přeposílání mohou trvat několik minut.</Step>
        <Step number={4 + offset} title="Zkontrolujte výsledek">Vyčkejte několik minut a zkontrolujte stav účtu níže. Další testovací platbu neposílejte, dokud se nevyhodnotí první.</Step>
      </ol>
      {bank && <a className="bank-guide-source" href={bank.helpUrl} target="_blank" rel="noopener noreferrer">Nápověda banky ↗</a>}
    </> : <p className="bank-guide-hint">Po výběru banky Berry ukáže odpovídající kroky.</p>}
  </div>;
}
