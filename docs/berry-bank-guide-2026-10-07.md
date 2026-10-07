# Berry: bankovní avíza a soukromí

Rešerše a úprava průvodce k 7. 10. 2026. Nejde o potvrzení kompatibility všech bank: rozhoduje skutečné avízo a výsledek testovací platby. Změna upravuje pouze návod a jeho lokální průchod; nezapíná filtry v cizích službách, nepřipojuje soukromé schránky a nemění parser ani oprávnění.

## Dvě nezávislé volby

1. Rozsah: vybrané VS nájmů (výchozí pro soukromý účet), nebo všechny příchozí platby samostatného účtu nájemného.
2. Doručení: banka přímo na adresu FlatBerry, nebo bankovní avízo do vlastní schránky a selektivní přeposílání.

Přímý příjemce sám soukromí neřeší. Pro soukromý účet musí omezení konkrétního VS proběhnout před doručením do FlatBerry. Fio tuto možnost dokumentuje přímo v bance. Samotný neprázdný VS může zahrnout soukromé příjmy. E-mailové filtry hledají text: musí se vyzkoušet na příchozím nájemném i negativních příkladech (odchozí platba, jiný VS, číslo shodné s částí účtu/částky). Není doložena univerzální přesná syntaxe napříč všemi bankami a poskytovateli.

Chybný nebo chybějící VS znamená ruční dohledání platby. Nový nájem vyžaduje aktualizaci filtru. Testovací 1 Kč má vlastní VS: dočasně jej povolit a ověřit minimální částku notifikace, po testu výjimku odstranit. Průchod dialogem nikdy nenahrazuje skutečné ověření bankovního účtu.

## Banky a primární zdroje

| Banka | Doložené nastavení / omezení | Zdroj |
|---|---|---|
| Air Bank | My Air: Menu → Nastavení a banka → Oznámení; zvlášť pro účet; e-mail. Přesný filtr VS a libovolný příjemce zde nejsou doloženy. | https://www.airbank.cz/co-vas-nejvic-zajima/nastaveni-upozorneni-pod-uctem/ |
| Česká spořitelna | Osobní George na počítači: profil → Informační zprávy → příchozí platby → Aktivovat → účet → e-mail → kontakt → potvrzení. Mobilní návod popisuje push. | https://www.csas.cz/cs/caste-dotazy/jak-si-v-georgi-nastavim-zasilani-informacnich-zprav |
| George Business | Samostatná varianta: Profil a nastavení uživatele → Notifikace; nezaměňovat s osobním Georgem. | https://www.csas.cz/cs/george-help/george-business/domovska-stranka/profile/turnover-notifications |
| Raiffeisenbank | Informuj mě, v mobilu Menu → Nastavení → Informuj mě. Zkontrolovat kanál a podmínky. | https://www.rb.cz/osobni/ucty/sluzby-k-uctum/informuj-me ; https://www.rb.cz/podpora/internetove-a-mobilni-bankovnictvi/nastaveni-notifikaci |
| Fio | Web Nastavení → Oznámení / mobil Moje Fio → Oznámení; Pohyby, příchozí, e-mail. Přímo filtr konkrétního VS, protistrany a minima. | https://www2.fio.cz/bankovni-sluzby/oznameni |
| KB+ | Web Nastavení → Nastavení služeb → Oznámení → Příchozí platby → účet → e-mail → uložit. Banka upozorňuje na opětovnou aktivaci po změně systému. | https://www.kb.cz/cs/podpora/mobilni-aplikace/vylepsujeme-oznameni-v-kb |
| KB MojeBanka | Oznámení o platbách; jiného příjemce přidat v Nastavení → Přidání nového příjemce. Neodvozovat z toho stejnou funkci KB+. | https://www.kb.cz/cs/podpora/ucty-a-platby/jak-vyuzit-notifikace-o-platbach |
| MONETA | Původní Internet Banka: Osobní nastavení → Nastavení Info Servisu. Nápověda výslovně rozlišuje novou verzi; alternativou nastavení bankou. | https://www.moneta.cz/caste-dotazy/odpoved/jak-si-nastavim-info-servis- |
| UniCredit | Online Banking: ozubené kolo → notifikace → účet/typ/kanál/podmínky → adresa; vybrat jednotlivé transakce, ne denní souhrn. | https://www.unicreditbank.cz/cs/obcane/digital/online-banking.html |
| J&T | Účet → Vlastnosti → notifikace pohybů → částka a kontakty → uložit a autorizovat. Formát avíza ve FlatBerry neověřen. | https://vitejte.jtbank.cz/ |
| ČSOB | Moje info zachováno jako orientační postup. Detailní aktuální retail menu nebylo doloženo dostatečně konkrétním veřejným primárním zdrojem; CEB je jiná varianta. | https://www.csob.cz/lide/ucty/internetove-a-mobilni-bankovnictvi/internetove-bankovnictvi ; https://www.csob.cz/documents/10710/36574/csob-ceb-uzivatelska-prirucka.pdf |
| CREDITAS | FAQ potvrzuje oznámení pohybů SMS/e-mailem. Přesná nabídka aktuálního CREDITAS One a formát avíza zbývají ověřit. | https://www.creditas.cz/faq |
| mBank | Primární zdroj potvrzuje mobilní push. E-mailové avízo každé příchozí platby s VS není doloženo. Nezaměňovat s měsíčním výpisem. | https://www.mbank.cz/osobni/mobilni-aplikace/funkce/ |
| Partners Banka | Obecná zmínka o oznámeních není důkaz e-mailového avíza příchozí platby s VS; nedávat smyšlené klikací kroky. | https://www.partnersbanka.cz/zustante-v-bezpeci |
| TRINITY, PPF, Oberbank | Aktuální konkrétní postup a příchozí avízo s VS nejsou v této rešerši dostatečně doloženy. Průvodce odkazuje na banku. Starší manuál PPF ani obecná notifikace nepotvrzují současné menu. | https://www.trinitybank.cz/ ; https://www.ppfbanka.cz/ ; https://www.oberbank.cz/ |

Pokrytí výběru: 15 bank + libovolný neznámý kód / Jiná banka. Toto není úplný katalog všech licencovaných bank a zahraničních poboček v ČR (včetně specializovaných a korporátních institucí). Nelze publikovat claim „všechny české banky podporujeme“. Další konkrétní návody vyžadují doložené aktuální bankovnictví a anonymizovaný vzorek avíza; uživatele není vhodné nutit k testovací platbě, pokud banka e-mailové avízo nenabízí.

## E-mailové služby

| Služba | Postup a podstatný rozdíl | Primární zdroj |
|---|---|---|
| Gmail | Přidat adresu v nastavení přeposílání, ověřit v cílové schránce, ponechat globální přeposílání vypnuté. Vytvořit filtr s akcí přeposlání. Platí pro nově příchozí zprávy. Potvrzení řeší správce pro konkrétního uživatele, bez zpřístupnění společné schránky. | https://support.google.com/mail/answer/10957?hl=cs ; https://support.google.com/mail/answer/6579?hl=cs |
| Seznam / Email.cz / Post.cz | Nastavení → Pravidla → Vytvořit nové pravidlo. Jen nové zprávy v Doručené a Hromadné. Nezaručovat konkrétní podmínku VS v těle bez ověření její dostupnosti. | https://o-seznam.cz/napoveda/email/moznosti-nastaveni/pravidla-pro-zpracovani-zprav/nastaveni-pravidel/ |
| Centrum / Atlas / Volný | Nastavení → Filtry. Nejvýše tři podmínky v jednom filtru, A SOUČASNĚ. Doporučit Pošli kopii na adresu; Přepošli na adresu originál neponechá. Upozorni emailem neposílá celé avízo. | https://freemail.help.economia.cz/articles/44664-filtry |
| Outlook.com / Hotmail / Microsoft 365 | Web Nastavení → Pošta → Pravidla → nové pravidlo; vybrané podmínky a Přeposlat. Nedoporučovat Použít u všech zpráv ani přílohu. Firemní správce může externí přeposílání blokovat. | https://support.microsoft.com/cs-cz/outlook/mail/use-rules-to-automatically-forward-messages ; https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-policies-external-email-forwarding |
| iCloud Mail | iCloud.com/mail → Nastavení → Pravidla → + → podmínka a akce. Změna může trvat 15 minut. Neprohlašovat schopnost filtrovat VS v těle, pokud podmínka chybí. | https://support.apple.com/guide/icloud/set-up-filtering-rules-mm6b1a3f8a/icloud |
| Thunderbird / Apple Mail | Preferovat pravidlo poskytovatele ve webové schránce. Místní pravidlo klienta nemusí běžet s vypnutým počítačem; není totéž co serverové přeposílání. | https://support.mozilla.org/en-US/kb/organize-your-messages-using-filters |

## Ochrana dat: audit skutečnosti

- `lib/inbound-bank/retention.ts`: 100 dní podle receivedAt; odstranění rawExcerpt a označení rawPurgedAt. IMAP smazání pouze pro odpovídající identitu schránky a UIDVALIDITY. Neúspěšná smazání se evidují a zkoušejí znovu. Scheduler úklid volá automaticky. Tento audit nespouští produkční mazání a nepotvrzuje nulový aktuální backlog.
- Zůstávají strukturované platební údaje, metadata a účetní evidence. Není to odstranění všech osobních údajů ani důkaz smazání záloh / kopií v soukromé schránce.
- `docs/bank-balance-privacy-2026-10-03.md`: rozpoznané zůstatky se maskují před uložením výňatku. Originální zpráva v IMAP může obsahovat zůstatek a neznámá formulace vyžaduje další test.
- Read-only metadata Renderu potvrzují existující spravovaný produkční Postgres flatcloud-rent-db. Render dokumentuje AES-256 při uložení: https://render.com/docs/postgresql-creating-connecting . Není to koncové šifrování e-mailů nebo aplikační šifrování každého platebního pole.
- `lib/secret.ts` šifruje přihlašovací tajemství AES-256-GCM; samo o sobě nedokládá šifrování celé databáze.

## Ověření změny

Původní SSR verifikace průvodce zachována. Nový browser test pokrývá výchozí soukromý režim, přímé doručení versus filtr, rozdílné návody služeb, pokračování po reloadu, testovací VS, nepředstírání ověření a mobilní šířku. Skutečné bankovní účty ani soukromé schránky se během testu nemění.
