# R26A – dokončení živého auditu

15. 9. 2026. Sandbox `flatcloud-ux-sandbox.onrender.com`, nasazený PR111 / `b911bf6e16e139379d3d0ffaeade3a1664bd6eb2`. Původní timeout ovládacího spojení byl odstraněn obnovením relace; čerstvá stránka potvrdila přihlášeného sandboxového administrátora bez nového zadání hesla.

## Živé kontroly PR111

Vytvořen výhradně syntetický dům `R24_AGENT_QA_2026_09 · R26A · Živý audit` (P1016), jedna jednotka a nájemník bez kontaktních údajů. Smlouva NS-P1016-U001-01 od 1. 1. 2025, automatické předpisy vypnuty. Žádné skutečné platby, e-maily ani nevratné mazání.

| Kontrola | Výsledek |
|---|---|
| Uložení bez potvrzení | Odmítnuto viditelnou chybou. |
| Chybějící náklady | Náhled i uložený detail ukazují „Chybí podklady“ a „Nelze určit“. |
| Uložení po potvrzení | Pracovní protokol za rok 2025 uložen, výslovně neúplný a neurčený k doručení. |
| Finanční nečinnost | Tabulka předpisů zůstala prázdná; smlouva stále bez evidovaných přeplatků. Živé ověření přes UI, nezávislé DB kontroly jsou v CI PR111. |
| Částečný překryv 1.–30. 6. 2025 | Odkaz na existující protokol, žádné tlačítko nového uložení. |
| Archivace | Pouze tento nový dům změněn na neaktivní; uložený protokol dál čitelný. Při kontrole byla po přerušení spojení použita nová karta stejného prohlížeče. |

ID syntetického domu: `cmu2gil9v0001pd2ais9dbj19`; smlouvy: `cmu2gkrsk000mpd2agst3oje0`; protokolu: `6de15c70-bc79-4147-984c-96f57eddc414`. Záznamy zůstávají zachované pro regresní kontroly.

## Nalezená chyba a oprava

Náhled při chybějících podkladech stále nazýval pracovní rozdíl „Předběžně vyrovnáno“, i když hodnota správně uváděla „Nelze určit“. Oprava sjednocuje název s detailem na „Pracovní rozdíl proti předpisům“ pro všechny hodnoty. Nepředstírá tím konečné saldo proti přijatým úhradám. Existující prohlížečový scénář nově kontroluje tento popisek i nepřítomnost zavádějícího stavu.

Oprava nemění výpočty, účetní zápisy, oprávnění ani databázi. Finální CI, merge, Render SHA a živé ověření opraveného popisku budou doloženy v navazujícím PR. Do jejich dokončení nejde o uzavření opravného bloku. Rozsah R26B–F zůstává podle původního plánu neimplementovaný.
