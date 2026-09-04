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

- zálohy, skutečné náklady, odečty a pravidla rozúčtování,
- protokol vyúčtování, přeplatek/nedoplatek a návazný finanční pohyb,
- roční balíček příjmů, výdajů, úroků a dokladů pro daňové zpracování.

### R6 — kategorizace a distribuce FlatCloud

- rating stavu a připravenosti jednotky,
- odhad CAPEX a valuace jednotek,
- prodejní matice, CRM zájemců, rezervace a smluvní milníky,
- kvartální a výroční podklady pro akcionáře,
- modul dostupný pouze interním rolím a aktivům skupiny FlatCloud.

## Release gate každé etapy

- izolovaná pracovní větev,
- nedestruktivní migrace s rollback plánem,
- Prisma validate a migrace nad izolovanou databází,
- cílené regresní verifikace,
- production build,
- browser smoke test klíčových scénářů,
- audit diffu a lidské schválení před merge/deployem.
