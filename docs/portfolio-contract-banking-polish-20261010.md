# Opravy portfolia, smluv a bankovního nastavení — 10. 10. 2026

Stav: DRAFT — implementováno, závěrečné ověření běží. Produkční sloučení a nasazení čeká na rozhodnutí po předložení auditu podle AGENTS.md.

## Výsledné chování

| Oblast | Změna |
| --- | --- |
| Horní záložky | Modrá zůstává zvolené kategorii. Neaktivní záložka je světlá a reaguje na skutečné najetí myši. Opravena společná komponenta, která dříve u všech kategorií se stejnou cestou nastavovala `aria-current="page"`. |
| Upozornění Smlouvy | Počítá stejné aktivní smlouvy končící do tří kalendářních měsíců jako KPI Expirující, včetně filtru vlastníka a objektů. Výročí zůstávají v samostatném přehledu; nepřičítají se ke smlouvám. |
| Dokumenty | Na kartě běžné přílohy je `Upravit zařazení`: název, kategorie a smlouva. Nabízené smlouvy odpovídají jednotce, objektu a přístupu uživatele. Změna smlouvy nastaví dokument jako soukromý a zapíše audit. Soubor a jeho identita se zachovají. |
| Bankovní účty | Standardní rozvržení, hledání a filtry vlastníka, nemovitosti, banky, používání a ověření. Přehled má nejvýše 20 účtů na stránce; QR, testy a nastavení jsou pod rozbalením. Původní serverové kontroly vlastníka a pověřeného správce zůstávají platné. |
| Berry | Kliknutí na výrazný blok s Berrym spouští krokového bankovního průvodce. |
| Nájemníci ve smlouvě | Hledání napříč dostupným adresářem, 40 výsledků na stránce, vlastní / domovní / dostupné profily a volitelné osoby bez překryvu nájmu ve zvoleném období. Při filtraci zůstávají vybrané osoby a role. Stejný domovní rozsah chrání vytvoření i změnu smlouvy na serveru. |
| Neobsazená jednotka | Prázdný blok smlouvy má `Nová smlouva` s předvybranou jednotkou pro oprávněného správce. |
| Basic | Do šesti jednotek přímo jednotky; větší výběr přes více budov nejprve budovy. Jedna budova zůstává v jednotkách. Ruční volba se pamatuje pro konkrétní účet, budovu lze otevřít a vrátit se k původnímu výběru. |
| Plocha | `NULL` znamená nevyplněno; `0` je platný zadaný údaj, včetně hromadného zadání a reportové položky. Výpočty na m² nadále vyžadují kladnou plochu. Záporné a nečíselné hodnoty se odmítají. |

## Dokumenty Valníčkové

Oprava poskytuje ovládání, které u dokumentu chybělo. Uživatel s EDIT/ADMIN otevře na kartě dokumentu **Upravit zařazení**, zvolí skutečnou kategorii a smlouvu podle osoby a období a uloží změnu. Následně může samostatně zvolit **Zpřístupnit nájemníkovi**. Nájemník ani uživatel s pouhým globálním právem číst tato ovládání nedostane.

Produkční dokumenty nebyly automaticky přiřazeny. Samotný název souboru či jméno osoby nedokazuje správnou historickou smlouvu. Záznam bez `leaseId` může existovat po nahrání přílohy k jednotce nebo objektu; konkrétní historický původ nelze bez záznamu události prohlásit za ověřený.

## Audit a dopady

- Žádná databázová migrace, změna autentizace, role, produkčního oprávnění ani tajných údajů.
- Rizikovější část: nová změna vazby dokumentu a zpřesnění rozsahu nájemníků v obou mutacích. Testy zahrnují EDIT versus VIEW, cizí jednotku, cizí profil, cizí Origin, zachování souboru a zrušení sdílení po změně vazby.
- Úkolové přílohy, revize, doklady nákladů a důkazy odečtů se tímto formulářem nepřesouvají.
- Změna metadat nepublikuje soubor nájemníkovi. Zapnutí sdílení má samostatné ovládání a existující kontrolu oprávnění.
- Nájem ve více jednotkách zůstává možný. Filtr volných osob je volitelný a porovnává vybrané období včetně budoucích smluv, ukončení a zrušení; ručitel či kontakt sám osobu neobsadí.
- Šest historických kontrol otisku reportového schématu přijalo schválenou změnu plochy z kladné na nezápornou. Ostatní otisky PDF a finančních kontraktů zůstávají kontrolované. Samostatná regrese ověřuje nulu, NULL, zápornou hodnotu a zachování kladného dělitele.
- Propojení účtu vlastníka mimo zadání nebylo měněno. Dva vzdálené nápady zůstávají na konci pipeline.

## Ověření

- Produkční build Next.js 16.2.10 / Node.js 22.23.1 prošel.
- Prisma validate prošlo; všech 110 migrací aplikováno na izolované PostgreSQL 18.4.
- Všech 160 verifikačních příkazů z build jobu CI prošlo. Lokální omezení Unix IPC vyžadovalo u části příkazů ekvivalentní `node --import tsx` místo CLI `tsx`; testy ani kontroly se nevypínaly. Dvě kontroly byly spuštěné s výchozím UTC a vypnutým úložištěm stejně jako v CI.
- Playwright: závěrečný výsledek bude doplněn před označením READY.
- Ruční vizuální kontrola bankovního přehledu na desktopu a šířce 390 px.

Produkce a produkční data se během ověřování neměnily. Nasazení patří až za schválení tohoto výsledku.
