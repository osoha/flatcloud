# R27C – první import MF v sandboxu a paměť

16. 9. 2026, výchozí sandbox HEAD c2fd935c785cb8f4b5dcdc69af7a275f81919b2d.

Administrace před kontrolou uváděla „Zatím neběhla“, bez importovaného období. První ruční import přes autorizované UI skončil 502. Render log 12:07:08 UTC potvrzuje `Reached heap limit ... JavaScript heap out of memory` při cca 244 MB heapu, následný automatický restart. Nevznikl úspěšný import. Nejde o chybu katastru Trnitá [610950] ani uživatelem doplněných dispozic.

Parser nově používá ExcelJS streaming reader, ignoruje styly a uchovává pouze hodnoty kandidátní tabulky. Zachovává validace hlaviček, pořadí VK, částek, duplicit, národního pokrytí a limitu velikosti. Limity listů/řádků kontroluje během čtení. Nepřidává závislost ani neupravuje finanční data. Průběžný stav importu nově odlišuje zahájení od úspěchu; neúspěšný pokus neblokuje další neforced kontrolu 24hodinovou úspěšnou cache.

Hlášky domu a přehledu rozlišují nedostupný dataset od chybějícího přiřazení. Katastr a dispozice zadané uživatelem zůstávají beze změny. Plánovač/import nebyl nově zapnut na pozadí: ruční kontrola je v Administrace → Data a importy.

Ověření před PR: TypeScript bez chyb; MF parser a benchmark validace; nový CI regresní subprocess načte 10 000 syntetických území třikrát při 128 MiB heapu. Skutečný oficiální soubor https://mf.gov.cz/assets/attachments/2026-08-15_Cenova-mapa.xlsx parsován lokálně při stejném limitu: 7 630 území, Trnitá/Brno 610950/trnita, VK1–4 393/313/265/248 Kč/m². Finální heap cca 100,6 MiB. Soubor ani osobní údaje nejsou v repozitáři. Nová DB regrese ověří opakování po neúspěchu; plné DB/build/browser kontroly musí doložit CI.

Nasazení a živý import, opakování bez duplicit, pokrytí 12/12 a benchmark ve valuacích jsou před mergem PENDING. Výsledky a přesné SHA/CI/deploy doplní auditní komentář PR. Pouze sandbox/ux-agent, žádné main/produkce, zprávy, platby ani změna uživatelských dispozic. Repilot zatím nespouštěn.
