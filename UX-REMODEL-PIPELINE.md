# FlatCloud UX remodel pipeline

## Cílový produkt

FlatCloud propojí property management, asset management a interní distribuci v jedné řídicí vrstvě napříč právními vlastníky. Provozní odpovědnost správce se nesmí zaměnit s finanční konsolidací skupiny FlatCloud.

## Neměnné principy

1. **Globální cockpit správce** zahrnuje všechny svěřené nemovitosti bez ohledu na vlastníka.
2. **Asset dashboard FlatCloud** zahrnuje pouze aktiva, která jsou výslovně konsolidována do skupiny FlatCloud.
3. **Externí vlastník** vidí a podle mandátu spravuje pouze své objekty a jednotky.
4. Oprávnění, právní vlastnictví, rozsah správy a konsolidace KPI jsou čtyři samostatné osy.
5. Každá finanční hodnota má období, stav, zdroj a auditovatelnou historii.
6. Plán nebo forecast nikdy bez potvrzení nemění smlouvu ani předpis.

## Implementační etapy

### R0 — výchozí stav a bezpečnost

- zachovat současný globální provozní cockpit FlatCloud Rent,
- zachovat přístupy externích vlastníků,
- uzamknout definice stavů předpisů, plateb, dluhu a obsazenosti,
- rozšiřovat verifikační skripty před každou datovou migrací.

### R1 — orientace a contract cockpit

- finanční headline smlouvy bez otevření editace,
- trvalé lifecycle akce a přímý přístup k předpisům,
- checklist dokončení nově založené nemovitosti,
- kontextová Metodika v hlavní navigaci a pracovních formulářích.

Tato etapa je první implementovaný vertikální řez. Nemění databázové schéma.

### R2 — vlastníci, skupiny a reporting scopes

- **R2A implementováno bez migrace:** provozní cockpit je označený jako pohled napříč vlastníky, rozsah se jmenuje „Vše ve správě“ a umožňuje rychlý výběr podle vlastníka,
- **R2B implementováno aditivně:** vlastník má explicitní vztah ke skupině, nemovitost samostatný rozsah správy a nullable konsolidační podíl; stávající data se automaticky nezařazují,
- **R2C implementováno:** samostatný asset pohled počítá finanční KPI pouze z aktiv s potvrzeným podílem nad 0 %; externí a nezařazená aktiva jsou vyloučena,
- **R2D implementováno aditivně:** více smluvních stran v jednom vztahu, explicitní hlavní smluvní strana a dohledatelnost stejné smlouvy z profilu každého partnera; datový základ připravuje role plátce, ručitele a kontaktu, zatímco obyvatel zůstává samostatnou evidencí,
- společná či oddělená korespondence a odpovědnost za platby bez slučování osob do jednoho záznamu,
- právní vlastník a ekonomická skupina,
- vztah ke skupině FlatCloud,
- rozsah správy a mandát externího vlastníka,
- konsolidace KPI: plná / poměrná / nekonsolidovaná,
- filtry: vše ve správě / FlatCloud Group / externí / vlastník / správce / výběr objektů,
- každý KPI zobrazuje aktivní rozsah.

### R3 — náklady, úvěry a asset cockpit

- **R3A implementováno aditivně:** karta objektu odděluje asset finance od nájemních financí, eviduje plán/objednávku/skutečnost OPEX a CAPEX a základní parametry úvěru,
- **R3A KPI:** skutečný OPEX, skutečný CAPEX, plán a závazky, aktuální jistina a měsíční dluhová služba,
- **R3B implementováno aditivně:** schválený roční rozpočet je oddělený od pracovního plánu a závazků; změny zůstatku, sazby a splátky úvěru mají datovanou neměnnou historii,
- **R3C implementováno aditivně:** náklad lze přiřadit celému objektu nebo jednotce, evidovat číslo podkladu a bezpečně připojit fakturu či nabídku do společného katalogu dokumentů,
- **R3D implementováno aditivně:** jeden náklad lze auditovatelně rozdělit mezi jednotky rovnoměrně, podle jejich plochy nebo vlastními podíly; uložené podíly dávají 100 % a přesné částky vždy celkovou hodnotu nákladu,
- **R3E implementováno aditivně:** datovaná historie ocenění se zdrojem napájí konsolidovaný LIVE asset cockpit; NOI, cashflow, yield, ROE, LTV a DSCR mají viditelnou definici a při neúplném ocenění či dluhové službě selžou bezpečně do stavu „—“,
- **R3F implementováno bez migrace:** asset cockpit řadí kritické a varovné finanční alarmy za jednotlivé nemovitosti před konsolidací; hlídá úplnost a stáří ocenění, dluhovou službu, LTV, DSCR, čerpání schváleného rozpočtu a fixace aktivních úvěrů a vede přímo k místu nápravy,
- další řez pokračuje etapou R4 — valorizace a forecast,
- OPEX, CAPEX, rozpočet a skutečnost,
- účetní doklady a rozdělení nákladů na objekt/jednotku,
- jistina, sazba, fixace, splátkový kalendář a zajištění,
- NOI, cashflow, yield, ROE, LTV a DSCR,
- alarmy pro odchylky, fixace a finanční limity.

### R4 — valorizace a forecast

- **R4A implementováno bez migrace:** samostatná read-only scénářová laboratoř porovnává smluvní vývoj s evidovanou indexací a expiracemi, pracovní plán s viditelnými předpoklady a MF referenci; konzervativní, základní a optimistický scénář promítají plánované hrubé nájemné i očekávané inkaso na 12, 24 nebo 36 měsíců a nic automaticky nezapisují do smluv ani předpisů,
- **R4B implementováno aditivně:** scénář lze uložit jako koncept s neměnným snapshotem vstupů, data a přesného rozsahu objektů; schválení je auditované, nemění smlouvy ani předpisy a další iterace vzniká jako samostatná dohledatelná revize,
- **R4C implementováno bez migrace:** uživatel může přímo v laboratoři upravit čtyři vlastní předpoklady, zachovat je při změně horizontu a uložit je do neměnné revize; schválený plán obsahuje oddělený dry-run převodu po jednotkách s účinností a rozlišením „k posouzení dodatku“, „nejprve obnovit nájem“ a „bez změny“, ale neprovádí žádný zápis do smluv, složek předpisů ani předpisů,
- **R4D implementováno aditivně:** ze způsobilého řádku schváleného plánu lze připravit samostatný návrh změny jedné smlouvy s právním důvodem a prvním dnem účinnosti; druhá kontrolní obrazovka vyžaduje explicitní potvrzení, poté verzovaně uzavře starou položku nájemného, založí novou a synchronizuje pouze budoucí neuhrazené automatické předpisy; workflow blokuje expirovaný vztah, změnu nájemného od snapshotu, předcházející indexaci, souběžný potvrzený návrh i uhrazený nebo ručně upravený budoucí předpis,
- R4 je funkčně uzavřeno; navazuje R5 — vyúčtování a podklady pro vlastníky,
- smluvní, plánované a tržní nájemné jako oddělené hodnoty,
- pevná valorizace, index, individuální změna a dorovnání na trh,
- konzervativní / základní / optimistický scénář,
- vacancy, expirace a očekávané inkaso,
- převod schváleného plánu do verzované změny smlouvy s účinností a preview.

### R5 — vyúčtování a podklady pro vlastníky

- **R5A implementováno bez migrace:** ze smlouvy vede primární cesta do read-only pracovního náhledu, který za uzavřené období odděluje předepsané zálohy od nájemného, zahrne pouze skutečné OPEX náklady kategorie Energie a služby přímo přiřazené nebo uloženě rozdělené na jednotku, ukáže zdroj a pravidlo rozdělení, odečty a konkrétní blokátory; historický ruční výsledek zůstává označený jako korekční zkratka bez protokolu,
- **R5B implementováno aditivně:** správce může protokol vystavit jen bez blokátorů a s explicitním potvrzením; server znovu načte podklady uvnitř serializované transakce, zmrazí zdroje, rozdělení, odečty a výsledek do databázově neměnného protokolu a atomicky vytvoří právě jeden nedoplatek, přeplatek nebo žádný pohyb při nulovém saldu; smlouva ukazuje historii a protokol má samostatnou tiskovou podobu,
- **R5C implementováno bez migrace:** samostatný roční balíček jednoho právního vlastníka vychází ze skutečně přiřazených bankovních úhrad a skutečných OPEX/CAPEX nákladů, transparentně používá současné vlastnické podíly, hlídá rozdělení společných nákladů a doklady a exportuje pracovní CSV; jistinu ani sazbu úvěru nevydává za zaplacený úrok a při chybějícím účetním zdroji balíček zablokuje,
- další řez pokračuje etapou R6 — kategorizace jednotek a interní distribuce,
- zálohy, skutečné náklady, odečty a pravidla rozúčtování,
- protokol vyúčtování, přeplatek/nedoplatek a návazný finanční pohyb,
- roční balíček příjmů, výdajů, úroků a dokladů pro daňové zpracování.

### R6 — kategorizace a distribuce FlatCloud

- **R6A implementováno aditivně:** interní cockpit zahrnuje pouze potvrzená konsolidovaná aktiva FlatCloud a ukládá neměnné datované hodnocení kvality jednotky, naléhavosti investice, odhadu CAPEX a interní distribuční připravenosti; rating není tržní ocenění a nic nezveřejňuje,
- **R6B implementováno aditivně:** valuace jednotky je oddělená od technického ratingu, ukládá se jako neměnný datovaný snapshot s typem zdroje a referencí a cockpit ukazuje součet posledních hodnot i Kč/m²; valuace je dostupná jen interním rolím a potvrzeným aktivům FlatCloud,
- **R6C implementováno aditivně:** interní CRM odděluje osobu zájemce od příležitosti ke konkrétní jednotce, eviduje fázi, nabídkovou cenu, nabídku zájemce a termín dalšího kroku a každé založení či změnu auditně zapisuje; nepřidává veřejné publikování, automatickou komunikaci ani právní rezervaci,
- **R6D implementováno bez migrace:** kvartální a roční interní podklad agreguje ratingy, valuace, CAPEX a CRM fáze pouze potvrzených aktiv FlatCloud a exportuje CSV bez jmen, e-mailů a telefonů; rozhraní výslovně odlišuje dnešní LIVE stav pipeline od aktivity založené v období, protože změny fází zatím nemají vlastní snapshot,
- R6 je funkčně uzavřeno jako interní základ; veřejný prodejní kanál, právní rezervace a automatická komunikace zůstávají mimo rozsah,
- rating stavu a připravenosti jednotky,
- odhad CAPEX a valuace jednotek,
- prodejní matice, CRM zájemců, rezervace a smluvní milníky,
- kvartální a výroční podklady pro akcionáře,
- modul dostupný pouze interním rolím a aktivům skupiny FlatCloud.

### Audit remediation P0A — finanční bezpečnost a rozsah práce

- obecná editace smlouvy už nemůže přepsat nájemné ani služby; z finančního headline vede primární dvoukroková cesta s budoucí účinností, důvodem a náhledem dotčených předpisů,
- změna vytváří nové časové verze nájemného a služeb a synchronizuje pouze budoucí automatické předpisy; uhrazené či ručně upravené období změnu blokuje,
- uhrazený měsíční předpis je uzamčený v rozhraní i serverových routách a odkazuje na auditovanou opravu platby,
- portfolio rozsah se jednotně přenáší do úkolů, revizí, salda a nespárovaných plateb; cílové fronty filtr skutečně aplikují.

### Audit remediation P0B — asset finance

- jistiny a splátky úvěrů používají 64bitové haléřové hodnoty, takže běžné úvěry v desítkách milionů Kč nepadnou na databázovém limitu,
- potvrzený stav úvěru ani ocenění nelze datovat do budoucnosti; forecast zůstává oddělený od LIVE historie,
- asset report vybírá poslední úvěrový snapshot nejvýše k rozhodnému dni a ocenění zadané v tentýž den zahrne do celého obchodního dne,
- historický roční podklad už nepoužije dnešní kartu úvěru jako náhradu za chybějící dobový snapshot.

### Audit remediation P0C — onboarding jednotek

- jednotku lze založit i před bankovním onboardingem; chybějící účet je viditelný nedokončený krok a smlouvu nadále nelze aktivovat bez cílového účtu,
- při více účtech vlastníka aplikace žádný nehádá ani nepředvybírá, zatímco jediný jednoznačný účet nabídne automaticky,
- z volby účtu vede přímý odkaz do profilu vlastníka a server vždy ověří, že účet patří právě zvolenému vlastníkovi,
- správce může atomicky založit až 50 bytů z jednoduchých řádků označení, podlaží a plochy; společné vlastnictví i volitelný účet nastaví jednou,
- checklist respektuje skutečnou závislost: jednotky → účty pro inkaso → smlouvy → předpisy.

### R7 — informační architektura a administrátorský cockpit

- **R7A implementováno bez migrace:** hlavní navigace odděluje interní Distribuci od Akcionářských reportů; nový interní rozcestník vede do aktivního kvartálního workflow a budoucí výroční část ukazuje bez nefunkčního odkazu,
- nejasné označení „Kategorizace“ bylo odstraněno; neutrální technické hodnocení a plánování CAPEX se oddělí od distribučního scope v R8A,
- **R7B implementováno bez migrace:** Administrace má samostatný přehled stavu a modulový rozcestník; detailní integrace a automatizace zůstávají zachované v pracovním prostoru a formuláře se po uložení vracejí do stejného kontextu,
- administrátorská navigace je sjednocena také na stránkách uživatelů a reportovacích šablon,
- **R7C implementováno bez migrace:** kvartální HTML náhled, PDF renderer i administrátorský náhled používají shodný deckový master; titulní blok má bezpečný rytmus bez kolizí, obsahové logo je méně dominantní, hlavička nese referenční identitu FlatCloud, footer období a číslo strany a prázdný technický grid se vykreslí jako jeden čistý rám,
- **R7D opravuje nedostatečnou vizuální paritu R7C:** zdrojový PPTX byl načten a změřen po jednotlivých prvcích; systémová šablona přechází z A4 na původní formát 13:9, používá přesnou diagonálu a barvy, barevné obsahové logo, typografickou hierarchii a bezlinkovou patičku zdroje. Neopodstatněné mezititulky a status badge jsou odstraněny; nová distribuční tabulka zůstává zachována,
- referenční základ tvoří kvartální `FlatCloud_Aksamit_2Q_2026_final`; výroční `FlatCloud_H1_2025_v1` slouží pouze ke kontrole společné značky, nikoli struktury,
- další řez pokračuje R8A — Kvalitou a technickým stavem portfolia.

### R8 — kvalita portfolia a plán obnovy

- **R8A implementováno aditivně:** technické hodnocení jednotky, naléhavost, odhad CAPEX, stav plánu a cílový termín mají vlastní neměnnou historii dostupnou ve správě všech oprávněných aktiv bez ohledu na konsolidaci či budoucí prodej,
- starší technická data z distribučních snapshotů se jednorázově převedou do nové evidence bez změny původní historie; distribuční modul už kvalitu ani CAPEX neupravuje, pouze ověřuje dostupnost technického podkladu a samostatně ukládá obchodní připravenost,
- globální přehled „Kvalita a CAPEX“ respektuje stejný rozsah portfolia jako provozní cockpit a detail jednotky ukazuje aktuální stav i auditní historii bez dalších informačních bublin,
- **R8B implementováno aditivně:** fronta obnovy řadí aktuální snapshoty podle stavu, naléhavosti, fáze plánu a prošlého termínu; dokončené položky se nevracejí mezi aktivní priority,
- pouze aktuální snapshot ve stavu Schváleno s kladným CAPEX a cílovým termínem lze atomicky a právě jednou převést do propojeného úkolu údržby, plánovaného nákladu a roční rozpočtové položky,
- převod respektuje editaci svěřeného aktiva, hlídá souběžnou otevřenou realizaci stejné jednotky a vytváří neměnnou vazbu i auditní stopu; Distribuce tuto vazbu nevlastní,
- **R8C implementováno aditivně:** realizace má neměnné události Zahájeno a Dokončeno; zahájení přepne propojený úkol do práce a náklad do závazku, dokončení uzavře úkol a propíše skutečný CAPEX bez přepsání schváleného rozpočtu,
- fronta i detail jednotky ukazují plán, skutečnost a odchylku; stav propojeného CAPEX úkolu se řídí pouze z modulu Kvalita a CAPEX, aby se nerozešly evidence,
- „Kvalita a CAPEX“ je provozní modul v levé navigaci u Úkolů, nikoli řídký shortcut na hlavní obrazovce; plovoucí formuláře Kvality, Distribuce, CRM, pozvánek a změny nájemného mají viditelné Zavřít, únik klávesou Escape i kliknutím mimo,
- **R8D implementováno bez migrace:** souhrnný plán obnovy čte poslední technické snapshoty a neměnné události realizace, rozděluje aktivní CAPEX do položek po termínu, pětiletého horizontu, pozdějších akcí a položek bez termínu a ukazuje fáze Záměr / Schváleno / V realizaci,
- dokončené realizace nevstupují zpět do aktivního plánu; skutečnost a odchylka aktuálního roku vycházejí pouze z dokončovacích událostí a nemění schválený plán,
- výhled respektuje provozní rozsah portfolia, je samostatnou podstránkou Kvality a CAPEX a výslovně není účetním podkladem ani součástí interní Distribuce,
- R8 tím uzavírá funkční pipeline kvality portfolia; vizuální sjednocení napříč aplikací bude následovat v samostatné designerské kontrolní vlně až po funkčních opravách.

### R9 — vstupní průvodci

- **R9A implementováno bez migrace:** průvodce založením nemovitosti po vyplnění ulice a města zobrazí orientační mapový náhled s PINem, čitelně zopakuje interpretovanou adresu a nabídne otevření větší mapy,
- mapa nezískává polohu uživatele, nepřepisuje zadanou adresu a při nevyplněné či nedostupné mapě zachovává plně použitelný formulář; obnovený koncept adresy se promítne i do náhledu,
- R9A je samostatný funkční bod vyvolaný lidským srovnáním s onboardingem Homeroo; detailní vizuální sjednocení zůstává součástí pozdější designerské vlny.

### R10 — hloubková auditní sanace

- **R10A implementováno bez migrace:** filtr období v reportu inkasa nyní řídí graf, souhrnné KPI i tabulku nemovitostí; dluh po splatnosti zůstává zřetelně označenou stavovou veličinou k jednotnému LIVE datu,
- detail financování používá pro dnešní jistinu, sazbu, splátku a ocenění pouze poslední potvrzený záznam nejvýše k dnešnímu obchodnímu dni; případný starší budoucí snapshot zůstane transparentně v historii jako plán a neovlivní KPI,
- roční podklady ve výchozím stavu otevírají předchozí uzavřený rok; výslovně vybraný aktuální rok je průběžný YTD balíček s cutoffem k dnešnímu dni, blokátorem finální připravenosti a jednoznačným označením v obrazovce, obsahu i názvu CSV,
- **R10B implementováno bez migrace:** přepárování celé platby zůstává uvnitř zdrojové nemovitosti, vyžaduje potvrzení dopadu a nabízí pouze aktivní vztahy nebo ukončené vztahy s otevřeným dluhem; kontrola platí shodně v pickeru i serverové transakci,
- oba vstupy ruční platby používají formulářovou idempotenci a databázovou unikátnost, takže opakované odeslání stejného požadavku nevytvoří druhý finanční pohyb,
- pokročilé pravidlo už nemá předvolenou akci Ignorovat; uživatel musí vědomě zvolit výsledek a server nadále vyžaduje alespoň jednu rozlišovací podmínku. Pravidla tak mohou bezpečně vyřadit opakované interní či nesledované pohyby,
- **R10C implementováno bez migrace:** chybějící skutečný OPEX za posledních 12 měsíců se již neinterpretuje jako účetně potvrzená nula; dotčené NOI, yield, cashflow, ROE a DSCR se zobrazí jako nedoložené, zatímco nezávislé LTV zůstává dostupné,
- agregace přiznává chybějící OPEX kterékoliv zahrnuté nemovitosti, vypíše konkrétní nemovitosti a vytvoří provozní upozornění s cestou k doplnění nákladů,
- kvartální report s budoucím rozhodným datem lze připravovat jako koncept, ale server i ovládací prvky blokují review a publikaci; obrazovka zřetelně odděluje rozhodné datum od dnešního data dostupnosti,
- **R10D implementováno bez migrace:** změna efektivního přístupu uživatele vyžaduje samostatné potvrzení, přičemž pouhá úprava kontaktních údajů zůstává bez dalšího kroku; kontrola probíhá znovu nad aktuálním stavem uvnitř transakce,
- administrace vysvětluje prioritu globálních rolí a globálního rozsahu nad jednotlivými granty a audit změny zachycuje objektová i jednotková oprávnění,
- ruční spuštění naplánované komunikace a retenční odstranění raw bankovních zpráv vyžadují potvrzení v rozhraní i na serveru; retention předem ukazuje počet dotčených zpráv, hranici stáří a zachování účetních záznamů,
- **R10E implementováno bez migrace:** všechny otevřené nativní rozbalovací editační panely lze zavřít klávesou Escape s návratem fokusu na jejich spouštěč; samostatné popup panely nadále nabízejí i viditelné tlačítko Zavřít a zavření kliknutím mimo,
- horní zkratka Ruční platba zachová kontext právě otevřené nemovitosti a nabídne jen její způsobilé nájemní vztahy; mimo objektový kontext dál respektuje aktivní portfolio filtr,
- katalog dokumentů má programově popsanou sadu filtrů, viditelné názvy polí, české názvy kategorií a fotografických fází, pojmenovaný odkaz na náhled a jednoznačné zrušení aktivních filtrů,
- R10 tím uzavírá hloubkovou funkční sanaci; navazuje samostatná R11 designerská a vizuální kontrolní vlna.

### R11 — designerská a vizuální kontrolní vlna

- **R11A implementováno bez migrace:** katalog Dokumentů používá předvídatelný responzivní grid; na širokém desktopu drží filtry v jednom kompaktním řádku, ve střední šířce je skládá do dvou vyvážených řádků a na mobilu do jednoho sloupce bez osiřelého pole nebo prázdné poloviny karty,
- datumové filtry zůstávají vedle sebe, akce mají stabilní výšku a zrušení filtru je vizuálně sekundární,
- všechny kotvy detailu jednotky včetně Kvality, Upomínek a Dokumentů respektují sticky horní lištu a lokální navigaci, takže nadpis cílové sekce po skoku nezmizí pod navigací,
- R11A vychází z cloudové vizuální kontroly na reálných scénářových datech; další blok R11B pokračuje průřezem hustých tabulek, navigací a menších viewportů.
- **R11B implementováno bez migrace:** husté pracovní tabulky Kvality, Distribuce a reportů s osmi a více sloupci drží čitelné minimální šířky a používají záměrný horizontální posun místo lámání názvů, částek, stavů a akcí do úzkých svislých pruhů,
- breakpoint 701–900 px už nekombinuje skrytý sidebar s rezervovaným levým odsazením; hlavní obsah i horní lišta využijí celou šířku a zachovají funkční mobilní menu,
- **R11C implementováno bez migrace:** plnostránkové prázdné stavy mají opět čitelnou hierarchii, klidnou vertikální plochu a jednotnou typografii, zatímco prázdné stavy uvnitř menších widgetů zůstávají záměrně kompaktní,
- formulářové stránky používají stabilní rytmus mezi návratem, titulkem a kartou; akce formuláře se bezpečně skládají na mobilu,
- mobilní titulky už neskrývají sekundární akce ani nemění textové primární tlačítko bez ikony na prázdný čtverec; důležité cesty se na úzkém viewportu zobrazí jako plnohodnotná tlačítka,
- další blok R11D pokračuje kontrolou výstupních a tiskových ploch a posledním průřezem vizuálních regresí.

## Release gate každé etapy

- izolovaná pracovní větev,
- nedestruktivní migrace s rollback plánem,
- Prisma validate a migrace nad izolovanou databází,
- cílené regresní verifikace,
- production build,
- browser smoke test klíčových scénářů,
- audit diffu a lidské schválení před merge/deployem.
