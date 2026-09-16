# R26D1 – potvrzené náklady v pracovním protokolu

16. 9. 2026. Výchozí remote a čistý checkout ověřeny na `ac566846cd287a5994208647a405ec65aac7bf42`, cílem pouze sandbox/ux-agent. AGENTS.md přečten. Bez migrace, reálných plateb, e-mailů a osobních údajů ze vzorů.

Potvrzené zdroje R26B dosud nebyly propojené s pracovním protokolem. Nově se přebírá poslední potvrzená verze každého dokladu. Novější nepotvrzená oprava ponechá předchozí čísla, ale přidá blokátor. Náklad musí být v období náhledu a smlouvy. Přímý řádek smlouvy lze převzít; řádek jednotky jen tehdy, pokud jediná smlouva pokrývá celé období řádku. Žádné implicitní dělení nákladů mezi střídající se nájemníky. Domovní řádky bez jednotky a přesahy čekají na rozdělovací pravidla.

Jakmile má dům potvrzený zdroj, je nákladová báze náhledu výhradně z potvrzených zdrojů, i když jde o jiné období. Staré OPEX náklady se nepřičítají; při jejich existenci náhled výslovně upozorňuje na referenční roli. Záměrná bezpečná migrace brání dvojímu započtení i u dosud nespojených kopií účetního dokladu; správce musí potřebné starší podklady doplnit. Pokud potvrzené zdroje dosud neexistují, zachovává se orientační původní náhled s upozorněním.

Souhrny, dodavatelské zálohy a rozpad složek se nesčítají s nákladem řádku. Dobropis se odečte. Teplo z faktury nadále čeká na externí rozúčtování; jeho vazba na externí výsledek potřebuje další rozvoj. Vlastnické položky se bez potvrzené výjimky nezahrnují, výjimky zachovávají důvod a varování. Žádný výpočet tepla ani ISTA API.

Nové pracovní snapshoty v2 uchovávají použitou verzi zdroje, řádek, službu, období, potvrzení a zdrojové složky. Historické v1/v2 zůstávají čitelné a neměnné. Tisk pracovního protokolu výrazně uvádí NÁVRH — NEURČENO K ÚHRADĚ. Není schváleným tenant PDF. Uložení nevytváří Charge, LeaseCredit ani platbu. Čtení potvrzených zdrojů stále vyžaduje přístup k celému domu; omezený přístup dostane blokátor bez domovních podkladů.

## Ověření

- Osm čistých příkladů: náklad proti doplatku/zero evidence; verze a rozpracovaná oprava; souhrny a složky; teplo/owner; cizí rozsah; přesahy a překryv smluv; nerozdělený dům; dobropis.
- DB integrace jen v izolované CI: náhled, žádné dvojí OPEX, snapshot a následná revize bez přepsání historie, finanční nečinnost, nepovolaný čtenář.
- Browser scénář: skutečný náhled, složky externího tepla, uložení označeného pracovního protokolu a nulové účtování.
- Lokálně TypeScript a sedm dosavadních R5A kontrol; finální CI, merge a živý audit musí být doloženy v PR. Tento dokument sám nepotvrzuje dokončení bran.

## Navazující práce

R26C měřidla a důkazní historie; R26D2 pravidla rozdělení po službě, časové plochy/osoby a hlavní/podružná voda; R26E úhrady, uzávěrka, odstranění dvojího dluhu; R26F schvalování, doručení/námitky, výsledný PDF a samostatné vypořádání. Náhled je vždy neúplný do dokončení úhrad a rozsahu služeb. Automatický MF refresh zůstává samostatným otevřeným bodem.

Poznatky Repilot z živého testu: aktuálně režim jednotky, automatické načtení nájemních intervalů včetně neobsazenosti, souvislý průvodce, PDF rekapitulace + detail. Syntetický příklad 12 000 Kč voda + 2 400 Kč elektřina, rok 2024 (366 dnů): podíl nájemce 11 173,77 Kč, neobsazenost 3 226,23 Kč. Vygenerované PDF zobrazuje celé koruny. Vytvoření předpisu bylo defaultně zapnuté a před uložením vypnuto; žádné odeslání ani dokončení. Původ načtených záloh/AI import nebyl ověřen. Tyto poznatky nepředstavují audit právní ani účetní správnosti Repilotu.

## Živý audit PR117 a navazující oprava zobrazení

PR117 merge `b2e12a85db63945e964a2cb6403434799555b3c5`, CI 35108358754: build + 10/10 nových kontrol, 138/138 browser bez opakování. Render `dep-dalahheq1p3s73epjbg0` LIVE 16. 9. 2026 14:36:47 UTC.

Na syntetickém domě P1017 / smlouvě V01 připravena verze 3 podkladu vody: 9 000 Kč leden–září, 3 000 Kč říjen–prosinec explicitně smlouvě, náklad dodávky nadále 12 000 Kč. Před potvrzením: nový řádek se nepřičetl, zůstal blokátor nepotvrzené opravy a nerozděleného původního domu. Po potvrzení: jediný řádek 3 000 Kč, verze 3, období 2025-10-01 až 2025-12-31. Pracovní protokol `c48cb63f-f8f8-4b00-920f-c4dc8efdbc94` uložen s označením NÁVRH — NEURČENO K ÚHRADĚ. Podklad `cmu4722pl1b41v32a2n7j9har`, starší v1/v2 zachovány. Žádné nové předpisy požadovány.

Živý audit našel chybu prezentace data v jedné tabulce náhledu: česká půlnoc byla formátována v UTC jako předchozí den (30. 9. místo 1. 10.). Snapshot a explicitní interval podkladu byly správně. Navazující oprava používá date-only businessDateKey a mění jen zobrazení; nepřepisuje data. Současně detaily vyúčtování používají moneyExact, aby nedošlo k vizuálnímu zaokrouhlení haléřů. Browser regrese nově ověřuje přesné datum i částku 12 000,37 Kč. Celé CI, opravné nasazení a opakovaný live audit se doloží v opravném PR.

### Návazný blok: automatické úkoly (po dokončení vyúčtování)

Požadavek uživatele ze 16. 9. 2026: samostatně doplnit automatické připomínky přípravy a doručení vyúčtování podle objektu a zúčtovacího období. Před implementací ověřit použitelné právní lhůty; neztotožňovat interní termín přípravy s termínem doručení. Prozkoumat automatické šablony Repilotu jako inspiraci pro kontrolní seznamy převzetí bytu a ukončení nájmu (prohlídka, závady, opravy, odečty, protokol). Tento blok není součástí R26D1 a nyní se nespouští.

Doplňující živá kontrola zjistila stejný posun data v historii protokolů; oprava používá také zde datum zúčtovacího období a přidává regresní ověření historie.
