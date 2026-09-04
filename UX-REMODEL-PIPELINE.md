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
