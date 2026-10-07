"use client";

import { useState } from "react";

const providers = [
  { id: "gmail", name: "Gmail", helpUrl: "https://support.google.com/mail/answer/10957?hl=cs", steps: ["Na počítači otevřete Nastavení → Zobrazit všechna nastavení → Přeposílání a protokol POP/IMAP (případně Přeposílání). Přidejte cílovou adresu FlatBerry.", "Gmail pošle potvrzení do cílové schránky. Požádejte správce FlatBerry o dokončení ověření pro vaši adresu. Globální přeposílání všech zpráv ponechte vypnuté.", "Přes možnosti vyhledávání sestavte a nejprve vyzkoušejte podmínky níže. Potom zvolte Vytvořit filtr → Přeposlat na a ověřenou adresu. Filtr přeposílá až nové zprávy."] },
  { id: "seznam", name: "Seznam / Email.cz / Post.cz", helpUrl: "https://o-seznam.cz/napoveda/email/moznosti-nastaveni/pravidla-pro-zpracovani-zprav/nastaveni-pravidel/", steps: ["Ve webové schránce otevřete Nastavení → Pravidla → Vytvořit nové pravidlo.", "Zadejte podmínky pro bankovní avízo a vyberte akci přesměrování na adresu FlatBerry. Zapněte pravidlo a uložte jej; nepoužívejte podmínku pro všechny zprávy.", "Pravidla se vztahují na nové zprávy v Doručené a Hromadné. Ověřte dostupnost podmínky pro místo, kde vaše banka uvádí VS. Pokud jej filtr neumí rozlišit, nepoužívejte toto nastavení pro soukromý účet."] },
  { id: "centrum", name: "Centrum / Atlas / Volný", helpUrl: "https://freemail.help.economia.cz/articles/44664-filtry", steps: ["Ve webové schránce otevřete Nastavení → Filtry. Vytvořte pravidlo pro bankovní avízo; jeden filtr umožňuje až tři podmínky.", "Podmínky pro odesílatele, příchozí platbu a vybraný VS spojte pomocí A SOUČASNĚ. Více slov v jedné podmínce se hledá jako celá fráze. Pro další VS vytvořte samostatné pravidlo.", "Vyberte Pošli kopii na adresu a zadejte adresu FlatBerry. Tato volba ponechá zprávu i vám. Akce Přepošli na adresu ji ve vaší schránce neponechá; Upozorni emailem neposílá celé avízo."] },
  { id: "outlook", name: "Outlook.com / Hotmail / Microsoft 365", helpUrl: "https://support.microsoft.com/cs-cz/outlook/mail/use-rules-to-automatically-forward-messages", steps: ["V Outlooku na webu otevřete Nastavení → Pošta → Pravidla → Přidat nové pravidlo.", "Zadejte podmínky pro vybraná bankovní avíza a akci Přeposlat na adresu FlatBerry. Nevybírejte Použít u všech zpráv ani přeposlání jako přílohu.", "Uložte pravidlo a ověřte doručení. U pracovního Microsoft 365 může externí přeposílání omezovat správce organizace; v takovém případě se na něj obraťte."] },
  { id: "icloud", name: "iCloud Mail", helpUrl: "https://support.apple.com/guide/icloud/set-up-filtering-rules-mm6b1a3f8a/icloud", steps: ["Na iCloud.com/mail otevřete Nastavení → Pravidla a tlačítkem + přidejte pravidlo. Pojmenujte je a vyberte podmínku zprávy a akci přeposlání.", "Ověřte, zda nabídka podmínek dokáže rozlišit konkrétní VS ve vašem avízu. Pokud ne, filtrujte VS už v bance; samotný filtr odesílatele soukromé příjmy neoddělí.", "Pravidlo uložte. Podle Apple může aktivace změny trvat až 15 minut. Nepoužívejte globální přeposílání celé schránky."] },
  { id: "other", name: "Jiná služba / Apple Mail / Thunderbird", helpUrl: "", steps: ["Pravidlo nastavte pokud možno ve webové schránce svého poskytovatele. Apple Mail a Thunderbird jsou poštovní programy; jejich místní pravidlo nemusí běžet při vypnutém počítači.", "V nápovědě poskytovatele ověřte selektivní přeposílání i možnost filtrovat obsah s VS. Pokud to neumí, použijte filtr přímo v bance nebo samostatný účet pro nájemné."] },
] as const;

export function BankMailForwardingGuide({ mailbox, selectedOnly }: { mailbox: string; selectedOnly: boolean }) {
  const [providerId, setProviderId] = useState("gmail");
  const provider = providers.find(item => item.id === providerId)!;
  return <div>
    <label className="field"><span>E-mailová služba</span><select value={providerId} onChange={event => setProviderId(event.target.value)}>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <ol>{provider.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p>Cílová adresa: <strong>{mailbox}</strong></p>
    <p><strong>Podmínky musí platit současně:</strong> skutečný odesílatel bankovního avíza, oznámení o příchozí platbě na správný účet{selectedOnly ? " a konkrétní VS nájemného" : ""}.</p>
    {selectedOnly && <p>Například: avízo od banky + příchozí platba + „Variabilní symbol: 123456“. Použijte vlastní VS a skutečné znění zprávy. Samotné číslo se může objevit také v částce nebo čísle účtu. Jedno pravidlo pro každý VS bývá přehlednější.</p>}
    <p>Před zapnutím porovnejte nájemné i soukromou platbu, odchozí platbu a platbu s jiným VS. Filtr má propustit jen vybrané zprávy. Zachovejte obsah avíza a neposílejte celou osobní schránku.</p>
    {provider.helpUrl && <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer">Oficiální návod e-mailové služby ↗</a>}
  </div>;
}

export function BankNotificationPrivacy() {
  return <details><summary>Jak chráníme vaše soukromí</summary>
    <p>U e-mailového propojení nám nepředáváte přihlašovací údaje do banky. Rozsah sdílených oznámení určíte v bance nebo ve své e-mailové schránce. Volba v tomto průvodci sama externí filtr nenastavuje.</p>
    <p>Rozpoznaný zůstatek účtu v textu notifikace před uložením výňatku skrýváme. Původní e-mail v přijímací schránce jej ale může obsahovat. Pokud to banka umožňuje, zasílání zůstatku vypněte přímo u ní.</p>
    <p>Automatický úklid je nastavený na 100 dní: odstraňuje textové výňatky notifikací uložené pro kontrolu a odpovídající zprávy z připojené přijímací schránky. Údaje o zaúčtovaných platbách zůstávají pro evidenci nájemného. Kopie ve vaší vlastní poště se tím nemažou; tato lhůta není příslibem odstranění ze všech záloh.</p>
    <p>Databázové úložiště na Renderu je šifrované při uložení. Neznamená to koncové šifrování e-mailů; proto doporučujeme posílat jen údaje potřebné k evidenci nájemného.</p>
  </details>;
}
