# Bankovní příjmy, výdaje a dopárování

Schválené zadání Ondřeje Šohaje z 30. 9. 2026, navazuje na PR210. Implementace je v samostatné větvi; produkční release až po auditu a explicitním schválení podle AGENTS.md.

## Chování

- Známý účet a neurčená nájemní smlouva: vytvořit standardní transakci domu k dopárování. Příjem se již automaticky neodkládá jako nerelevantní jen proto, že není známá smlouva. Výslovné pravidlo IGNORE a ruční vyřazení zůstávají.
- Odchozí notifikace: automatické předání pouze při explicitním směru, částce, vlastním účtu a dosavadní důvěryhodnosti zdroje. Účet příjemce odchozí platby není vlastní účet. Zůstatek není částka platby. Protichůdné směry, nepodporovaná měna, nejasný vlastní účet a neověřený odesílatel zůstávají u hlavního administrátora. Parser nezaručuje pokrytí všech formátů bank ani úplnost výdajů; nezávislým kontrolním zdrojem zůstává výpis.
- Odchozí pohyb nepatří k nájemním předpisům. Směruje se do existující evidence Bankovní výdaje a úhrady a projde jejími pravidly. Bez přiřazení nebo CREATE_COST nevznikne náklad.
- Sdílený účet několika domů se neodhaduje podle VS nájemníka. Superadmin může výdaj předat jednomu z domů s aktivní vazbou na stejný vlastní účet, včetně neaktivního domu. Oprávnění uživatelů se nemění.
- Bankovní poplatek nesouvisející s bytem vyřazuje uživatelem potvrzené pravidlo IGNORE podle směru, účtu, protistrany, zprávy a případně částky. Původní pohyb, aplikované pravidlo, autor a historie zůstávají zachované. Nevzniká náklad ani daňový výdaj. Záloha SVJ se nesmí vyřadit pravidlem pro bankovní poplatek.
- Bankovní pohyb a ekonomický náklad zůstávají oddělené. Nový návrh nákladu má stav COMMITTED; doklad, skutečnost, rozdělení na jednotky a věcnou klasifikaci potvrzuje člověk. Zálohy, vratky, vlastní převody, kauce a jistina úvěru mají existující samostatné kategorie.

## Úkoly a přístup

- Jedna nevyřešená transakce vytváří jeden úkol podle unikátního dedupeKey. Řešitel: aktivní správce s existujícím přístupem, jinak jediný aktivní člen domu s EDIT/ADMIN, jinak aktivní superadmin. Neurčená jednotka neznamená přístup k nové jednotce; úkol má celý dům jako kontext.
- Neurčený dům nebo nezpracovatelný e-mail zůstává soukromým obecným úkolem superadmina, s odkazem na původní e-mail. Po materializaci se tento úkol uzavře a případné dopárování řeší úkol transakce.
- Částečně nerozdělený výdaj zůstává otevřený; úplné přiřazení nebo explicitní ignorování úkol uzavře. Storno úhrady jej znovu otevře. Ručně zvolený řešitel existujícího úkolu se při opakované kontrole nepřepisuje.
- Přidělení využívá stávající systém e-mailových upozornění a jeho preference. Kontrolní scénáře neposílají skutečné e-maily a nevolají IMAP.
- Staré ignorované záznamy se hromadně nepřepisují. Nová logika se použije při novém nebo explicitně opakovaném zpracování.

## Jméno plátce ve výpisu

Chybějící jméno nebo „Neznámý plátce“ lze nahradit jménem nájemníka při jednoznačném evidovaném účtu plátce v témže domě a okruhu vlastního účtu. Počet kandidátů se posuzuje přes celý dům před filtrem viditelnosti; skrytá smlouva nesmí způsobit falešnou jednoznačnost. Shodný účet více různých nájemníků zůstává neurčený. Domestic a český IBAN se porovnávají kanonicky. Původní bankovní pole a notifikace se nepřepisují; skutečné jméno z banky má přednost. Zobrazení pokrývá seznam, detail, centrální frontu a detail e-mailu.

## Roční podklady

Stávající balíček nadále odděluje přijaté platby, skutečné náklady podle data vzniku a doložené úhrady podle bankovního data. Věcně neklasifikované pohyby vyvolají BANK_UNCLASSIFIED a nejsou automaticky daňovou položkou. Ignorované výdaje tento nedostatek nevyvolávají. Kontrola účtu je dostupná jen ve scope celého domu a pro účet daného vlastníka nebo účet s neurčeným vlastníkem. Vlastníci s přístupem jen k jednotkám nevidí cizí celkové počty.

## Inspirace

- Repilot: https://www.repilot.cz/parovani-banky — pravidla pro známé pohyby, neznámé k doplnění pravidla.
- Repilot: https://www.repilot.cz/navod-pravidelne-naklady-nemovitosti — typy opakovaných nákladů a zálohy odděleně.
- Homeroo: https://homeroo.cz/dokumentace/cashflow-a-statistiky/danove-podklady-par9 — předání příjmů, výdajů a dokladů jako podkladů pro účetní. Nepřebíráme automaticky daňové závěry ani odhady.

## Ověření

Statické behaviorální kontroly `scripts/verify-bank-routing-review.ts`; integrační a browser scénáře `e2e/zzz-bank-routing-review.spec.ts` pokrývají zachování neznámého příjmu, přiřazení a deduplikaci úkolu, SVJ oproti poplatku, částečné úhrady a storno, meziroční náklad, roční neúplnost, neaktivní dům se sdíleným účtem a doplnění jména při zachování bankovních dat.
