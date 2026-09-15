# R26B – služby, faktury a externí podklady

Výchozí sandbox HEAD `c758cee490345b1705b972ad8bd0345d71dfa113`, ověřeno 15. 9. 2026; čistý checkout a AGENTS.md. Pouze pracovní větev a PR do sandbox/ux-agent.

## Implementace

- Nová evidence Podklady vyúčtování v nemovitosti a odkaz z náhledu smlouvy. Režimy celý dům / jednotka s externím výsledkem, faktura / dobropis / externí výsledek. Libovolný počet nájemníků v čase není omezen na čtyři; podklad podporuje až 500 řádků.
- Náklad dodávky a informativní zálohy dodavateli jsou oddělené. Součet nákladových řádků musí být přesně roven ceně dodávky, informativní souhrny se nepřičítají. Přesahy a dílčí období vyžadují odůvodnění. Dobropisy mají záporné částky a vazbu na potvrzenou fakturu.
- Katalog služeb odlišuje studenou vodu, vytápění, ohřev, vodu pro ohřev, elektřinu a další položky. Vytápění/ohřev z faktury čeká na externí rozúčtování. Vlastní tepelný algoritmus ani ISTA API neexistuje.
- Ruční přepis potvrzovaného originálu, jednotka a volitelná smlouva u řádku, období, náklad, spotřeba a jednotka, základní a spotřební složka, korekce, zaokrouhlení. Úplný rozpad se validuje proti nákladu; dílčí zdrojové složky se zachovají bez tvrzení, že tvoří úplný rozpad.
- Originál používá existující Document/FileAsset a stávající oprávnění dokumentů. Vazba na skutečný OPEX PropertyCost je volitelná a musí odpovídat nákladu dodávky. Nová evidence nezakládá druhý účetní náklad.
- Návrh → samostatná kontrola originálu → potvrzení. Bez originálu nelze potvrdit. Potvrzení uchová ID a SHA souboru i autora. Návrhy i potvrzené podklady jsou neměnné; oprava je nová verze s důvodem. DB trigger brání přepisu a mazání historie, UNIQUE a serializovatelné transakce chrání duplicity a souběh. Další kontrola brání znovupoužití stejného originálu v překrývajícím se rozsahu pod jiným číslem dokladu.
- Vlastnické náklady standardně OWNER. Ruční zahrnutí vyžaduje odůvodnění a samostatné potvrzení přesného varování; uloženo v auditu. Deratizace a neurčené položky čekají na individuální posouzení. Potvrzení není právní závěr.
- Podklady jsou interní evidence celého domu: vyžadují členství/oprávnění na úrovni domu, samotný přístup k jedné jednotce nestačí. Historie archivovaného domu je čitelná, zápis zakázaný. Žádný tenant export ani rozšíření oprávnění.

## Kontroly a omezení

Šest čistých validačních kontrol lokálně: cena dodávky proti doplatku, součty/souhrny/složky, duplicity řádků, datum/období, důvody rozdělení a owner/heat klasifikace. DB sada navíc kontroluje potvrzení, finanční nečinnost, immutable trigger, duplicity a souběh, opravné verze, originál a přístupy, owner warning, externí jednotku, dobropis a archivaci. Prohlížečový scénář ověřuje zachování rozpracovaných dat po chybě, samostatné potvrzení a opravnou verzi. DB testy jen v izolované lokální/CI databázi. Kompletní CI a nasazení musí být doloženy v PR před uzavřením.

Tento blok zavádí potvrzené zadání/přepis, nikoli automatické OCR/PDF/Excel parsování. Zdroje se ještě nepřičítají do náhledu R26A, který dosud vychází ze stávajících PropertyCost; uživatel je na to výslovně upozorněn. Nové napojení rozúčtování je R26D, skutečně přijaté úhrady a uzávěrka R26E. Žádné účtování, reálné platby nebo e-maily. Pozdější spotřebitel musí vybrat aktuální potvrzenou verzi a nečerpat současně podklad a jeho původní účetní náklad. Potvrzení podkladu není schválení úplného vyúčtování.

Právní rozlišení navazuje na časově rozlišené zdroje v `r26-service-settlement-plan.md` a schválené zadání. Podklad s nestandardní položkou se nesmí prezentovat jako právně způsobilý jen kvůli potvrzení varování. Testovací údaje jsou syntetické s označením `R24_AGENT_QA_2026_09`; žádné reálné osobní údaje z příloh nejsou součástí kódu nebo PR.
