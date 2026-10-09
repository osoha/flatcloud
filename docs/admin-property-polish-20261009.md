# Administrace, úkoly a karty objektů — 9. 10. 2026

Stav: DRAFT — před produkcí vyžaduje výsledek CI a lidské rozhodnutí podle AGENTS.md.

## Rozsah změn

| Požadavek | Řešení |
| --- | --- |
| Grafické avatary i v Profi | Výchozí hodnota true pro nové uživatele; jednorázová migrace zapne grafiku stávajícím uživatelům. Poté lze osobní volbu znovu změnit. |
| Zarovnání statusu uživatelů | Status navazuje na text identity, nikoli na levý okraj avataru. |
| Integrace a Drive | Odstraněn starý návod k bankovnímu účtu, technická konfigurace sběrné schránky zachována; sjednoceny rozměry a zarovnání akcí Drive. |
| Oznámení | Formulář přes šířku nahoře, nejvýše pět aktuálních/naplánovaných oznámení, další a archiv pod rozbalením. |
| Změna účtu | Zachováno oznámení konkrétní smlouvě a PDF; odstraněno duplicitní interní oznámení. Úkol žádá doložení doručení/potvrzení, odpovídá správce nebo jednoznačný vlastník. Starší produkční záznamy se nemění. |
| Automatické úkoly | Doplněn katalog existujících událostních postupů a jejich skutečného místa nastavení. Zobrazen poslední cron a brána odečtů. Připravené katalogové položky nejsou vydávány za funkční spouštěče. |
| Cenový benchmark | ČSÚ dosud nenahradilo ruční SaleBenchmarkSnapshot v obecných reportovacích KPI. Nový přehled ČSÚ/MF a výsledků synchronizací, ruční vrstva pod rozbalením. |
| Reporting | Přejmenováno na Šablony reportů; vysvětleno verzování, doplněna viditelná akce pro úpravu konceptu nebo náhled a novou verzi. |
| Vlastnický filtr | Kompaktní volba vlastníka, nejvýše pět osobních oblíbených, hledání bez diakritiky včetně evidovaných vlastníků domu. Vyhledávací aliasy se nestávají vlastníky jednotek a nemění oprávnění ani částky. |
| Úkoly v osobním seznamu | Cizí obecné úkoly se nezobrazují v běžné frontě ani jejím KPI. Administrátorský přehled všech dostupných úkolů je samostatná volba. |
| Odpovědný úkolu | Přiřazení přímo v detailu, kontrola přístupu cílové osoby, revize a audit. Automatika zohledňuje aktivního správce z přístupů, jinak vlastníka. Nejednoznačné spoluvlastnictví zůstává nepřiřazené. |
| Tlačítka úkolu | Editovat úkol / Uzavřít případ, rozměry a umístění publikování do portálu. |
| Přehled objektu | Uživatel 9. 10. v 19:52 schválil opravený koncept Profi. Implementován obsah ve dvou sloupcích: upozornění a platby vlevo, automatická vizitka správce / hlavního kontaktu vpravo. Původní šestice KPI, rozbalovací průvodce a všech 13 záložek zůstávají; odstraněn duplicitní Stav objektu. Obsazenost a aktivní smlouvy zůstávají jako stručné odkazy. |
| Připravenost správy | Upřesnění uživatele z 19:54: krok splní vybraný aktivní správce nebo potvrzená samospráva, nikoli počet členů. Samospráva nezobrazuje zavádějící výzvu k doplnění správce. |
| Nájemníci a smlouvy domu | Celé řádky lze otevřít kliknutím i klávesnicí; samostatné odkazy na jiné entity zůstávají funkční. |
| Platby domu | Sloupec Jednotka vychází ze skutečného přiřazení předpisů a jistot. Nepřiřazený pohyb není vydáván za přiřazený podle návrhu. |
| Náklady, technický pasport a nastavení | Sjednocené akce a responzivní rozložení. Technický pasport a základní nastavení používají různé skupiny údajů; sdílený editační formulář nezakládá druhou evidenci. |
| Banka a pravidla | Obě části jsou funkční: výjimky používá párování a stav příjmu je diagnostika. Přesunuty pod rozbalení, nikoli odstraněny. |
| Měřidla domu | Výchozí filtr jen společná objektová měřidla; volitelný přehled dostupných jednotek. Evidence, historie, opravy, podružná měřidla a výměny mají existující backend. Vyřazená měřidla a archivovaný dům nenabízejí nový odečet. Domovní tarif nemá plnohodnotnou editaci; produkční automatika odečtů závisí na konfigurační bráně. |
| Dokumenty | Oddělené společné dokumenty a jednotky. Kontrola přístupu zohlední také nepřímou vazbu přes smlouvu, náklad, úkol a komentář. VIEW vlastníka k domu nepovolí cizí jednotky, ani bez propojeného vlastnického profilu. Explicitní EDIT/ADMIN k domu a konkrétní přístupy k jednotce zůstávají respektovány. |
| Jednotka a portál | Jasně označený blok Portál nájemníka u osob v jednotce. |
| Historie jednotky | Předpisy, bankovní pohyby, automatické zprávy a doklady ukazují nejvýše 10 řádků; všechny starší záznamy jsou dostupné po rozbalení. |

## Živá kontrola

Po dokončení přihlášení ověřeno pouze čtením živé aplikace: hledání „Šohaj“ vracelo dva objekty, zatímco hlavička Veské uvádí Ondřeje Šohaje a SVJ. Jednotka 3 je vlastněná společností BrickFlow; Ondřej je u společnosti uvedený jako podepisující osoba. Hledání dosud neobsahovalo vlastníky z evidence domu. Oprava přidává jejich jména do hledání, ale právní vlastnictví jednotek zůstává oddělené. Syntetická regrese ověřuje oba případy: přímé vlastnictví jednotky a dům dohledatelný pod osobou, jejíž jednotka je evidovaná na společnost. Žádná produkční data ani propojení účtů se neměnila.

## Rizika a schválení

- Zpřísnění bezpečnostní hranice dokumentů; ověřit seznam i přímé stažení cizích příloh.
- Změna příjemců bankovních oznámení a odpovědnosti úkolů. Účetní párování a částky se nemění.
- Migrace vzhledu jednorázově přepíše současné false na true. Jde o záměrné nastavení všech uživatelů dle zadání.
- Odpovědný stávajících otevřených automatických úkolů se doplní při dalším běhu, pokud úkol stále odpovídá aktivnímu pravidlu. Ruční přiřazení a uzavřené úkoly se nepřepíší.
- Žádný merge, nasazení, produkční databázový zápis ani skutečné odeslání zpráv nebylo provedeno.

## Ověření

První CI nad 01d3bdb: migrace a produkční build prošly; vlastníci i uživatelská nastavení prošly. Nové prohlížečové testy odhalily Secure cookie neposílanou APIRequestContextem a nejednoznačný selektor dvou tabulek; opraveno autentizovaným browser fetch a přesným výběrem vyřešených plateb, s přidanými kontrolami skutečné chybové odpovědi. Integritní otisk přístupů dokumentů byl aktualizován k explicitně požadované bezpečnostní změně a zůstává připnutý. Další běh ověří i schválený přehled a připravenost správy. Výsledek před nasazením bude doplněn po doběhnutí.
