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
| Scope a oprávnění | 8 omezených identit; přímé cizí URL vrací 404 | 8 trvalých R24 účtů aktivních; admin průchod dokončen | bezpečnostní optika zahájena |
| Nájemní lifecycle | existující smoke + R24 správce jednotek | nájemník, jednotka, smlouva, finance, kauce a ukončení prošly read-only | produktová/právní matice dokončena |
| Technická správa | R24 technický správce | vytvořen označený úkol a ověřen detail | benchmark dokončen |
| Distribuce a postprodejní péče | R24 šéf distribuce | Distribuce, CRM a Uvítací dopisy prošly | benchmark dokončen |
| Asset a výroční reporting | R24 asset manager | kvartální i výroční editor, návaznost a publikační blokace prošly | benchmark dokončen |
| Vizuální konzistence | DOM/overflow gate 58/58 | hlavní trasy bez overflow; navigace, landmarky a notice spacing změřeny | optika zahájena |
| Dokumenty a úložiště | kontraktové testy lokálního driveru | Google Drive je v sandboxu `disabled` | simulace navržena |
| Právní dokumenty | negativní scénáře navrženy | neúčinné kroky pouze do preview | rešerše dokončena |

## Potvrzené nálezy

| ID | Závažnost | Role | Lifecycle | Stav | Shrnutí |
|---|---|---|---|---|---|
| R24-001 | P1 | senior graphic designer / novic | navigace a reporting | OPEN | Reportové podtrasy nemají jednoznačnou aktivní položku levého menu. |
| R24-002 | P1 | technický správce / externí vlastník / security admin | úkoly a postprodejní péče | OPEN | Vlákno úkolu nemá interní a vlastnickou viditelnost; všechny záznamy se zobrazují vlastníkovi. |
| R24-003 | P2 | specialista přístupnosti | kvartální a výroční reporting | OPEN | Oba reportové editory vkládají druhý landmark `main` do hlavního `main`. |
| R24-004 | P1 | správce jednotek / asistentka | dokumenty a úložiště | COVERAGE_GAP | Sandbox má Google Drive provider `disabled`, proto v něm nelze uživatelsky ověřit upload, preview, verze a zotavení. |
| R24-005 | P1 | asset manager / security admin | uživatelé a reporting | OPEN | Trvalé testovací identity vstupují do běžných obchodních výběrů a automatických týmových defaultů. |
| R24-006 | P1 | asset manager | mapa výročního reportu | OPEN | Geokódování přijalo chybný bod adresy bez upozornění nebo potvrzení uživatelem. |
| R24-007 | P2 | senior graphic designer / novic | informační bloky | OPEN | Obecná komponenta `notice` slepuje tučný titulek s navazujícím textem bez mezery. |
| R24-008 | P1 | novic / technický správce | založení úkolu | OPEN | Formulář nového úkolu bez kontextového odkazu předvybere první objekt v seznamu. |
| R24-009 | P2 | novic / interní asistentka | platby a rozsáhlé výběry | OPEN | Ruční platba používá dlouhý plochý select bez hledání nebo filtrování. |

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
- URL: detail výroční revize 2026 a detail kvartální revize 2026 Q3.
- Kroky: otevřít jednotlivé sekce obou editorů a zkontrolovat strom landmarků.
- Očekávání: jeden nevnořený `main` na dokument.
- Skutečnost: `Shell` vykresluje hlavní `main` a oba reportové editory do něj vkládají další `main`.
- Reprodukovatelnost: všechny zkontrolované sekce kvartálního i výročního editoru.
- Doporučení: vnitřní kontejner změnit na `section` nebo `div` s popsaným regionem.
- Akceptační test: `document.querySelectorAll("main").length === 1` na všech kvartálních i výročních sekcích.

### R24-004 – chybí uživatelsky testovatelný sandbox storage

- Persona: správce jednotek, interní asistentka, security admin.
- URL: `/nastaveni/system`.
- Očekávání: izolovaný neprodukční provider umožní ověřit kompletní dokumentový lifecycle.
- Skutečnost: Google Drive zobrazuje „Chyba konfigurace“, provider `disabled`; CI ověřuje jen aplikační kontrakt lokálního driveru.
- Doporučení: přidat `sandbox-local` storage se zřetelným TEST štítkem, stejnými metadata/checksum/permission kontrakty a fault injection; následně samostatný izolovaný Drive účet a test root.
- Akceptační test: upload → list → preview → download → nová verze → přesun → simulovaná nedostupnost → zotavení; UI nikdy nevydává local/fake provider za reálnou archivaci nebo doručení.

### R24-005 – testovací identity v obchodních datech

- Persona: asset manager, security admin.
- URL: detail výroční revize, sekce Tým a skupina; detail kvartální reportovací skupiny; `/ukoly/novy`.
- Testovací data: osm aktivních účtů `R24 · …` s doménou `@flatcloud.test`.
- Očekávání: testovací účty jsou viditelné správcům, ale nevstupují automaticky do reportů, obchodních kontaktů ani běžných výchozích hodnot.
- Skutečnost: výroční editor je automaticky zahrnul do výchozího týmu; jsou také v členských a odpovědnostních výběrech.
- Rozsah: reportové PDF, reportovací skupiny, úkoly a další selektory postavené nad aktivními uživateli.
- Reprodukovatelnost: 3/3 kontrolované kontexty.
- Doporučení: explicitní příznak testovací/service identity a serverový filtr pro business pickery a automatické defaulty; administrace je nadále zobrazí s TEST štítkem.
- Akceptační test: testovací účet lze spravovat a použít v testovacím runneru, ale bez výslovného zapnutí se neobjeví ve výstupním týmu, PDF ani produkčním business pickeru.

### R24-006 – chybný geokód bez kontroly kvality

- Persona: asset manager.
- URL: výroční editor, sekce Mapa portfolia.
- Testovací data: `Javorová 10, 602 00 Brno`; uložený bod `49.1428661, 16.6528369`.
- Očekávání: automatický bod leží v očekávané části Brna, případně editor upozorní na nejednoznačnost a vyžádá potvrzení.
- Skutečnost: editor přijal bod zřetelně posunutý na jihovýchod; v PDF se Brno zobrazilo ve špici Jihomoravského kraje.
- Reprodukovatelnost: 1/1 uložená adresa + vizuální srovnání s referenční mapou.
- Doporučení: validovat výsledek vůči městu, PSČ a územnímu bounding boxu, zobrazit kvalitu geokódu a umožnit potvrzení či ruční korekci bodu. Neopravovat globálním posunem mapy.
- Akceptační test: známé adresy z různých krajů projdou regresní sadou; nízká shoda se neuloží bez viditelného varování a potvrzení.

### R24-007 – nulová mezera v informačních blocích

- Persona: senior graphic designer, novic.
- URL: `/distribuce/zajemci`, `/distribuce/uvitaci-dopisy`.
- Kroky: změřit geometrii sousedních prvků `strong` a `span` v `.notice`.
- Očekávání: titulek a vysvětlení mají čitelný typografický odstup nebo jsou na samostatných řádcích.
- Skutečnost: rodič má `display: block`, oba texty jsou na stejném řádku a naměřená mezera je `0 px`.
- Reprodukovatelnost: 2/2 kontrolované distribuční obrazovky.
- Doporučení: definovat společný layout a gap pro title/body variantu notice bez změny inline variant.
- Akceptační test: vizuální snapshot a DOM měření pro notice s titulkem; mezera je nenulová nebo jsou prvky na samostatných řádcích.

### R24-008 – nebezpečný výchozí objekt nového úkolu

- Persona: novic, technický správce.
- URL: `/ukoly/novy` bez query parametrů.
- Očekávání: bez kontextového odkazu je vybrána prázdná volba „Vyberte nemovitost“ a odeslání vyžaduje vědomý výběr.
- Skutečnost: automaticky se vybere první objekt v abecedním/datovém pořadí (`AGT-CYCLE-20260905-A`).
- Rozsah: každý ručně zakládaný úkol z globálního tlačítka.
- Reprodukovatelnost: 1/1 čisté otevření globálního formuláře.
- Doporučení: default pouze z ověřeného `propertyId` kontextu; jinak prázdná povinná volba.
- Akceptační test: globální formulář nemá vybraný objekt, kontextový odkaz předvybere právě svůj dostupný objekt a odmítne cizí ID.

### R24-009 – plochý výběr nájemního vztahu

- Persona: novic, interní asistentka.
- URL: `/platby/nova`.
- Očekávání: rychlé dohledání podle objektu, jednotky, osoby, čísla smlouvy nebo VS s jasným rozlišením aktivních a historických vztahů.
- Skutečnost: nativní select obsahuje desítky dlouhých položek včetně ukončených vztahů, bez hledání, seskupení nebo filtru.
- Reprodukovatelnost: 1/1 sandbox s přibližně čtyřiceti vztahy; problém roste s portfoliem.
- Doporučení: přístupný combobox s hledáním, scope filtrem a skupinami Aktivní / Historické; zachovat možnost účtovat na ukončený vztah.
- Akceptační test: klávesnicí lze dohledat vztah podle všech podporovaných identifikátorů a výsledek jednoznačně ukazuje stav i objekt.

## Ověřené živé zápisy

V trvalém sandboxu byly vytvořeny pouze výslovně schválené a označené testovací záznamy:

- úkol `R24 · agentní kontrola návaznosti technického úkolu`,
- objekt `UX Audit – Rezidence Javorová`,
- kategorie Provoz / závada, priorita Vysoká, stav Otevřený,
- marker v zadání `R24_AGENT_QA_2026_09`,
- bez příloh, bez zprávy ve vláknu, bez externí komunikace.

Dále bylo vytvořeno osm aktivních účtů `R24 · …` s adresami `@flatcloud.test` pro role novic, pokročilý uživatel, externí vlastník, šéf distribuce, interní asistentka, technický správce, správce jednotek a asset manager. Účty mají omezené scope dle matice R24; nebyly odeslány pozvánky ani e-maily.

## Omezení průchodu

Skutečné role a scope byly ověřeny nad osmi deterministickými identitami v izolované CI databázi. Stejných osm označených účtů je aktivních také v trvalém sandboxu. Trvalý sandbox byl dále procházen přihlášeným administrátorem; automatizované zadávání přihlašovacích údajů do cloudového prohlížeče není bezpečně povoleno, proto živý vizuální průchod každým účtem zvlášť zůstává otevřený. To neoslabuje CI důkaz serverového scope, ale audit zůstává `IN_PROGRESS` a neoznačuje neprovedené role ani storage lifecycle za hotové.

## Kandidáti do následné pipeline

1. P0/P1 bezpečné oddělení interních a vlastnických záznamů v úkolech a přílohách.
2. P1 označení a izolace testovacích/service identit od obchodních defaultů a výstupů.
3. P1 validace geokódu a potvrzení nejednoznačné adresy.
4. P1 bezpečný prázdný default objektu při globálním založení úkolu.
5. P1 jednoznačná reportová navigace a aktivní stav.
6. P1 sandboxové dokumentové úložiště a pozdější izolovaný Google Drive integrační gate.
7. P2 oprava landmarků obou reportových editorů, notice spacing a škálovatelných vyhledávacích výběrů.
8. Dokončit živé vizuální rolové průchody bezpečnou autentizací a potom uzavřít výslednou opravnou pipeline.
