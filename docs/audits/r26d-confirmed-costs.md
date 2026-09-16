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
