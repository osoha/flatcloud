# R25 – sjednocení finančních grafů

Schválený rozsah ve vlákně: valorizace, kauce, náklady, inkaso/pohledávky a úvěry. Pouze sandbox/ux-agent. Grafy jsou read-only nad stávajícími daty a oprávněními, bez migrace či změny finanční evidence.

## Valorizace
Celý horizont 12/24/36 měsíců se vejde do šířky karty. ResizeObserver zachová čitelnou výšku 290 px i po změně viewportu; popisky se adaptivně zředí, žádný měsíc z dat nezmizí. Výchozí detailní osa vychází z minima/maxima všech řad s rezervou; je označena jako potenciálně nenulová. Přepínač Od nuly vždy zahrne nulu, skutečné poklesy včetně nuly se neoříznou. Jednotky Kč/měsíc nebo procentní změna každé řady vůči vlastnímu prvnímu měsíci. Nulový/chybějící základ dává mezeru a Nelze vyjádřit, ne nekonečno. Smluvní řada je přerušovaná, plán modrý, inkaso zelené. Přesné hodnoty pro myš i fokus, změna od začátku a rozbalovací datová tabulka. Uložené revize stále čtou vlastní snapshot.

## Kauce
Reporty → Kauce: měsíční historie skutečně držené jistiny z ledgeru všech smluv ve zvoleném oprávněném rozsahu, včetně ukončených vztahů. Sjednaná částka není zdrojem skutečného příjmu. Před první doloženou evidencí a do budoucna je mezera; aktuální měsíc končí k LIVE datu. Měsíční filtr 12M/YTD/vlastní řídí historii, zatímco tabulka a souhrny nadále ukazují aktuální stav.
Porovnání objektů používá stejné aktuální řádky jako tabulka a identifikuje objekt ID, nikoli jménem: drženo, chybí složit, k vypořádání. Poslední veličina zahrnuje evidovaný úrok, je samostatná a řady se nesčítají. Také samostatná evidence /kauce má porovnání podle své aktuální záložky.

## Náklady, inkaso a úvěry
Finance objektu: srovnání rozpočtu, objednáno a skutečnosti po OPEX/CAPEX a kategorii; stejný rok a zdroj jako původní tabulka, explicitní překročení. Chybějící limit není nula. Plán se do čerpání nepřičítá, skutečnost není úhrada.
Inkaso: stávající přepínač sloupce/linie a finanční výpočet zachován, graf má fluidní šířku; totéž rozměrové zlepšení sdílí obsazenost. Doplněny pohledávky 1–30/31–90/91+ dní podle obchodního data splatnosti, s původním výpočtem neuhrazené částky k LIVE datu, nezávisle na období příjmové křivky.
Detail úvěru: dvě oddělené křivky jistiny a měsíční dluhové služby. Jen nebudoucí datované stavy, chybějící splátka je mezera. Časové rozestupy odpovídají datům; spojnice nepotvrzuje úhrady. Původní historie a podklady zůstávají dostupné.

## Ověření
Lokálně: TypeScript, Prisma validate, 3 výpočtové regrese (osy/nuly/mezery/procenta/historie kaucí), původní valorizace R4A 8/8 a období reportů 9/9. Nový izolovaný UI/DB test: 36M, mobil 390 px, přepínače, klávesnice, 36 měsíčních bodů i tabulka, zachování uloženého plánu, aktuální kauce, prázdný/cizí scope. Kompletní CI a živé důkazy se doplní do PR. Implementace sama není uzavřená brána.
