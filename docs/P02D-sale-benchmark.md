# P02D — orientační prodejní benchmark

## Cíl

FlatBerry ukládá kvartální orientační ceny bytových jednotek na stejné územní granularitě jako MF benchmark nájemného. Realizované ceny a aktivní nabídky zůstávají oddělené. Benchmark slouží pro trend, orientační hodnotu portfolia a scénáře yield, ROE, LTV a hypotetického prodeje; není individuálním znaleckým posudkem.

## Rozsah první verze

- super-admin může vložit jeden snímek ručně nebo atomicky importovat UTF-8 CSV,
- počáteční základna sahá nejvýše jeden kvartál před spuštění a může být označena jako částečná,
- zdrojové území se mapuje na `territoryCode` stávající MF lokality domu,
- realizovaný průměr je primární vstup valuace, medián aktivních nabídek je jen srovnávací signál,
- jednotka potřebuje kladnou plochu; chybějící pokrytí se vykazuje jako chybějící údaj, ne jako nula,
- portfolio ukazuje benchmark odděleně od poslední potvrzené valuace,
- převzetí benchmarku do historie valuace je jednotlivé a vyžaduje výslovné potvrzení asset managera,
- žádný živý scraper ani neveřejné API nejsou v této verzi spouštěny.

## Datový snímek a idempotence

Přirozený klíč snímku tvoří zdroj, metrika, typ a ID zdrojové lokality, cílové území, rok a kvartál. Normalizovaný obsah má SHA-256 hash. Shodný opakovaný import je no-op; změna stejného klíče vytvoří auditovaný update s původním a novým hashem, cenou, vzorkem a časem načtení.

Povinná CSV hlavička:

```text
source;metric;sourceLocalityType;sourceLocalityId;sourceLocalityName;sourceSeoName;territoryCode;ruianCadastralCode;cadastralName;municipalityName;marketYear;marketQuarter;windowFrom;windowTo;pricePerSqmCzk;sampleCount;mappingQuality;baselinePartial;acceptedSampleCount;rejectedSampleCount;sourceUrl;parserVersion;methodVersion;retrievedAt
```

Import přijme nejvýše 5 000 datových řádků a 2 MB. Jednoduchý kontrakt nepodporuje uvozovky ani středník uvnitř hodnoty. Celý soubor se zpracuje v jedné databázové transakci: chyba kteréhokoli řádku zabrání částečnému importu.

## Zdroje a metriky

| Zdroj | Metrika | Použití |
| --- | --- | --- |
| `SREALITY_PRICE_MAP` | `REALIZED_AVERAGE` | Orientační realizovaná cena za m² a vstup benchmarkové valuace |
| `SREALITY_LISTINGS` | `OFFER_MEDIAN` | Doplňkové porovnání aktivních nabídek |
| `MANUAL_REFERENCE` | Obě metriky | Ručně doložený a auditovaný náhradní zdroj |

Automatický sběr lze doplnit až po potvrzení podporovaného přístupu, licence, limitů, pravidel robots/ToS a stability zdrojového schématu. Importér je záměrně oddělený od získávání dat: budoucí sběrač musí produkovat stejný validovaný kontrakt a zachovat surový kontrolní hash, verzi parseru, verzi metodiky, zdrojový odkaz a počty přijatých/vyřazených vzorků.

## Územní mapování

| Stav | Význam | Vstup do KPI |
| --- | --- | --- |
| `EXACT` | Zdroj odpovídá jednomu cílovému katastrálnímu území | Ano |
| `ONE_TO_MANY` | Jedno zdrojové území je doloženě použito pro více katastrů | Ano, s viditelným varováním |
| `APPROXIMATE` | Použita přibližná hranice nebo náhradní oblast | Ano, s viditelným varováním |
| `UNMAPPED` | Vazba není potvrzena | Ne |

Mapování znovu používá MF lokalitu domu, aby se rozsah benchmarku nerozpadl na jinou územní soustavu. Pokud dům MF lokalitu nemá, benchmark pro něj není dostupný.

## Důvěra a kvalita

Důvěra je deterministická funkce počtu vzorků:

- `HIGH`: 20 a více,
- `MEDIUM`: 8–19,
- `LOW`: 3–7,
- `INSUFFICIENT`: méně než 3.

Jde o provozní stupnici kvality, ne o statistický interval spolehlivosti. Zdrojové okno může mít nejvýše 400 dní a nesmí končit po čase načtení. Cena musí být kladná a používá celé haléře.

## Výpočty a KPI

`benchmark jednotky = plocha m² × realizovaná cena za m²`

`benchmark domu = součet benchmarků všech aktivních bytových jednotek`

Hodnota domu vznikne pouze při úplném pokrytí aktivních bytových jednotek. Následné indikativní metriky používají stejné NOI, cashflow a jistinu jako stávající finanční přehled:

- `yield na benchmarku = NOI / benchmarková hodnota`,
- `ROE na benchmarku = cashflow / (benchmarková hodnota − jistina)`,
- `LTV na benchmarku = jistina / benchmarková hodnota`,
- `QoQ = změna poslední realizované ceny za m² proti předchozímu dostupnému kvartálu`.

Agregovaná hodnota portfolia se zobrazí jen při úplném benchmarkovém pokrytí vybraných domů. Potvrzené ocenění a prodejní benchmark jsou dvě samostatné série.

## Potvrzení valuace a scénář prodeje

Převzetí benchmarku jednotky vyžaduje kontrolu zdroje, kvartálu, vzorku, důvěry, plochy a výsledné částky. Potvrzení vytvoří nový `UnitValuationSnapshot` se zdrojem `MARKET_BENCHMARK` a referencí `P02D:<snapshot-id>`. Stejný snímek nelze pro tutéž jednotku převzít dvakrát.

Kalkulátor hypotetického prodeje odečítá od benchmarkové hodnoty uživatelem zadané procento transakčních nákladů, procento daňové rezervy, další rezervu a evidovanou jistinu úvěru. Výsledek je pouze scénář a nepředstavuje účetní nebo daňový výpočet.

## Startovní pilot

Pilotní ověření používá Černice a dvě oddělené reference zachycené 22. 9. 2026:

- realizované ceny: 94 800 Kč/m², 10 transakcí, okno 2025-09 až 2026-08,
- aktivní nabídky: medián 101 667 Kč/m², 5 nabídek.

Před importem do konkrétního prostředí musí super-admin doplnit skutečný `territoryCode` používaný MF mapováním domu a ověřit zdrojový odkaz. Vzor v administraci není automaticky produkčním záznamem.

## Navazující rozšíření

- schválený kvartální sběrač s retry, limity a detekcí změny schématu,
- uložené agregace odmítnutých záznamů a reprodukovatelný surový vstup mimo aplikační DB,
- časová řada hodnoty jednotek a portfolia ve výročním reportu,
- alarm zastaralého nebo chybějícího kvartálu,
- odborně schválený model korekcí podle atributů jednotky; základní benchmark je zatím vědomě nepoužívá.
