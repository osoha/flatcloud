# P07A — Přehled zájemců interní distribuce

P07A spojuje existující identitu kontaktu s jeho příležitostmi. Není samostatnou evidencí žádostí o pronájem. Nemění schéma databáze, zapisovací služby CRM, opce ani oprávnění.

- Přímá cesta **Zájemci** v menu a **Distribuce → Přehled zájemců**, `/distribuce/zajemci#adresar`.
- Jeden řádek na kontakt: jméno, e-mail/telefon, zdroj a kontaktní poznámka; uvnitř každá jednotka, fáze, datum dalšího kroku a poznámka příležitosti. Kontakty bez příležitosti zůstávají samostatně dostupné.
- Hledání je bez rozdílu velikosti písmen a diakritiky. Filtry domu, jednotky, fáze a termínu musí všechny odpovídat stejné příležitosti. Zobrazují se jen odpovídající příležitosti, se stejným výběrem v podrobném prodejním přehledu níže. Celkové KPI mají výslovný popis nezávislosti na filtrech.
- Termíny: po termínu, dnes, příštích 7 dní (zítra až dnes + 7 včetně), bez termínu. Jen otevřené fáze; WON/LOST zůstávají dostupné bez termínového filtru. Den se počítá podle Europe/Prague, uložené datum jako kalendářní UTC datum. Dnešní termín není zpožděný.
- Bez příležitosti znamená bez příležitosti v rozsahu přehledu: aktivní dům interní distribuce. Kombinace s domem, jednotkou, fází či termínem proto nemá výsledek. Příležitosti mimo tento rozsah se nepočítají a nezobrazují; kontakt zůstává dostupný.
- Detail a úprava přejde na zvýrazněný řádek příležitosti s původní editací ceny, opce a historií. Přidat příležitost předvyplní kontakt. Kontaktní a příležitostní poznámky zůstávají oddělené.
- Filtry jsou v URL, lze obnovit stránku či odkaz sdílet mezi oprávněnými uživateli. Nový kontakt a uložení editace přejdou do neomezeného přehledu, aby uložený záznam nezmizel pod filtrem.

## Ověření

`node --import tsx scripts/verify-p07a-prospect-overview.ts`: kombinace filtrů, více příležitostí, prázdné kontakty, uzavřené fáze, kalendářní hranice a neměnnost zdrojových dat.

`e2e/p07a-prospect-overview.spec.ts`: čtyři scénáře v izolované databázi — přehled a změna příležitosti s historií; skutečný formulář filtrů a termíny; úprava kontaktu a předvyplněná nová příležitost; nový kontakt, desktop/mobil a odmítnutí neinterní role. Existující CRM a R33 testy zůstávají v plném CI.

Živé sandboxové převzetí a odkazy na release jsou zaznamenány v konsolidované pipeline po nasazení. Produkční převzetí vyžaduje samostatné rozhodnutí.
