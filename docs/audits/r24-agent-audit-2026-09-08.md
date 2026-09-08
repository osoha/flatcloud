# R24 – agentní audit FlatCloud

- Datum zahájení: 8. 9. 2026
- Prostředí: `sandbox/ux-agent` + izolovaná CI databáze
- Datový marker: `R24_AGENT_QA_2026_09`
- Stav: `IN_PROGRESS`
- Automatizovaný gate: 58/58 browser scénářů
- Produkce / `main`: beze změny

## Pokrytí

| Oblast | Automatizovaná role QA | Cloud browser | Odborný audit |
|---|---:|---:|---:|
| Scope a oprávnění | 8 omezených identit; přímé cizí URL vrací 404 | hlavní admin trasy prošly | bezpečnostní optika zahájena |
| Nájemní lifecycle | existující smoke + R24 správce jednotek | seznamy nájemníků a smluv prošly | produktová/právní matice dokončena |
| Technická správa | R24 technický správce | vytvořen označený úkol a ověřen detail | benchmark dokončen |
| Distribuce a postprodejní péče | R24 šéf distribuce | Distribuce, CRM a Uvítací dopisy prošly | benchmark dokončen |
| Asset a výroční reporting | R24 asset manager | reporty, rozcestník a výroční editor prošly | benchmark dokončen |
| Vizuální konzistence | DOM/overflow gate 58/58 | 14 hlavních tras bez overflow; 1 nález navigace | optika zahájena |
| Dokumenty a úložiště | kontraktové testy lokálního driveru | Google Drive je v sandboxu `disabled` | simulace navržena |
| Právní dokumenty | negativní scénáře navrženy | neúčinné kroky pouze do preview | rešerše dokončena |

## Potvrzené nálezy

| ID | Závažnost | Role | Lifecycle | Stav | Shrnutí |
|---|---|---|---|---|---|
| R24-001 | P1 | senior graphic designer / novic | navigace a reporting | OPEN | Reportové podtrasy nemají jednoznačnou aktivní položku levého menu. |
| R24-002 | P1 | technický správce / externí vlastník / security admin | úkoly a postprodejní péče | OPEN | Vlákno úkolu nemá interní a vlastnickou viditelnost; všechny záznamy se zobrazují vlastníkovi. |
| R24-003 | P2 | specialista přístupnosti | výroční reporting | OPEN | Výroční editor vkládá druhý landmark `main` do hlavního `main`. |
| R24-004 | P1 | správce jednotek / asistentka | dokumenty a úložiště | COVERAGE_GAP | Sandbox má Google Drive provider `disabled`, proto v něm nelze uživatelsky ověřit upload, preview, verze a zotavení. |

## Důkazy a akceptační testy

### R24-001 – nejednoznačná aktivní navigace

- Persona: novic, senior graphic designer.
- URL: `/reporty/predpisy`, `/reporty/saldo`, `/reporty/akcionarske`, `/reporty/kvartalni`, `/reporty/vyrocni`, `/reporty/rocni-checklist`.
- Kroky: otevřít trasu a vypsat `.sidebar a[aria-current="page"]`.
- Očekávání: právě jedna aktivní položka odpovídající aktuální informační větvi.
- Skutečnost: Předpisy, Dlužníci a Akcionářské reporty aktivují současně i obecné Reporty; kvartální, výroční a roční checklist aktivují pouze obecné Reporty.
- Reprodukovatelnost: 6/6 tras.
- Doporučení: explicitní hierarchie reportové navigace a přesná pravidla aktivního stavu.
- Akceptační test: pro každou uvedenou trasu přesně jeden `aria-current="page"` a očekávaný název.

### R24-002 – chybí interní poznámka v úkolu

- Persona: technický správce, externí vlastník, security admin.
- URL a testovací data: `/ukoly/b3334543-dc2b-4081-b12e-970d0d29ed02`; úkol `R24 · agentní kontrola návaznosti technického úkolu`.
- Kroky: založit provozní úkol, otevřít vlákno a zkontrolovat composer a datový model.
- Očekávání: autor před zápisem rozliší interní pracovní poznámku od zprávy viditelné vlastníkovi.
- Skutečnost: UI uvádí „Záznam se ihned objeví vlastníkovi“ a model `TaskEntry` nemá viditelnostní pole.
- Rozsah: všechny úkoly dostupné vlastníkovi podle jeho property/unit scope; může zasáhnout i přílohy vlákna.
- Reprodukovatelnost: 1/1 živý scénář + statická kontrola přístupové logiky.
- Doporučení: `INTERNAL` / `OWNER_VISIBLE` s bezpečným defaultem, viditelným štítkem, filtrem na serveru a auditem změn.
- Akceptační test: OWNER_VIEWER nikdy neuvidí interní entry ani interní attachment přes UI, přímé URL nebo export.

### R24-003 – vnořený hlavní landmark

- Persona: specialista přístupnosti.
- URL: detail výroční revize 2026.
- Kroky: otevřít výroční editor a zkontrolovat strom landmarků.
- Očekávání: jeden nevnořený `main` na dokument.
- Skutečnost: `Shell` vykresluje hlavní `main` a výroční editor do něj vkládá další `main`.
- Reprodukovatelnost: 1/1 výroční editor.
- Doporučení: vnitřní kontejner změnit na `section` nebo `div` s popsaným regionem.
- Akceptační test: `document.querySelectorAll("main").length === 1` na všech výročních sekcích.

### R24-004 – chybí uživatelsky testovatelný sandbox storage

- Persona: správce jednotek, interní asistentka, security admin.
- URL: `/nastaveni/system`.
- Očekávání: izolovaný neprodukční provider umožní ověřit kompletní dokumentový lifecycle.
- Skutečnost: Google Drive zobrazuje „Chyba konfigurace“, provider `disabled`; CI ověřuje jen aplikační kontrakt lokálního driveru.
- Doporučení: přidat `sandbox-local` storage se zřetelným TEST štítkem, stejnými metadata/checksum/permission kontrakty a fault injection; následně samostatný izolovaný Drive účet a test root.
- Akceptační test: upload → list → preview → download → nová verze → přesun → simulovaná nedostupnost → zotavení; UI nikdy nevydává local/fake provider za reálnou archivaci nebo doručení.

## Ověřený živý zápis

V trvalém sandboxu byl vytvořen jediný nový záznam:

- úkol `R24 · agentní kontrola návaznosti technického úkolu`,
- objekt `UX Audit – Rezidence Javorová`,
- kategorie Provoz / závada, priorita Vysoká, stav Otevřený,
- marker v zadání `R24_AGENT_QA_2026_09`,
- bez příloh, bez zprávy ve vláknu, bez externí komunikace.

## Omezení průchodu

Skutečné role a scope byly ověřeny nad osmi deterministickými identitami v izolované CI databázi. Trvalý sandbox byl procházen přihlášeným administrátorem; nové trvalé uživatelské účty nebyly vytvořeny, protože vytvoření účtu vyžaduje samostatné potvrzení v okamžiku zápisu. Živý průchod byl po 14 hlavních trasách a výročním editoru přerušen odpojením cloudového pracovního prostředí. Audit proto zůstává `IN_PROGRESS` a neoznačuje neprovedené scénáře za hotové.

## Kandidáti do následné pipeline

1. P0/P1 bezpečné oddělení interních a vlastnických záznamů v úkolech a přílohách.
2. P1 jednoznačná reportová navigace a aktivní stav.
3. P1 sandboxové dokumentové úložiště a pozdější izolovaný Google Drive integrační gate.
4. P2 oprava landmarků výročního editoru.
5. Dokončit živé rolové průchody po schváleném vytvoření testovacích účtů a následně sestavit opravnou pipeline podle všech uzavřených nálezů.
