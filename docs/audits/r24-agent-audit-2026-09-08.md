# R24 – agentní audit FlatCloud

- Datum zahájení: 8. 9. 2026
- Prostředí: `sandbox/ux-agent` + izolovaná CI databáze
- Datový marker: `R24_AGENT_QA_2026_09`
- Stav: `IN_PROGRESS`
- Výchozí automatizovaný gate: 58/58 scénářů; nové bloky a aktuální integrační gate jsou uvedeny na konci auditu.
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
| R24-001 | P1 | senior graphic designer / novic | navigace a reporting | FIXED_CI_LIVE | Reportové podtrasy nemají jednoznačnou aktivní položku levého menu. |
| R24-002 | P1 | technický správce / externí vlastník / security admin | úkoly a postprodejní péče | IMPLEMENTED | Schválený blok B zavádí interní a vlastnickou viditelnost; úplný CI a živý retest eviduje [PR #94](https://github.com/osoha/flatcloud/pull/94). |
| R24-003 | P2 | specialista přístupnosti | kvartální a výroční reporting | FIXED_CI_LIVE | Oba reportové editory vkládají druhý landmark `main` do hlavního `main`. |
| R24-004 | P1 | správce jednotek / asistentka | dokumenty a úložiště | COVERAGE_GAP | Sandbox má Google Drive provider `disabled`, proto v něm nelze uživatelsky ověřit upload, preview, verze a zotavení. |
| R24-005 | P1 | asset manager / security admin | uživatelé a reporting | PARTIAL | Trvalé testovací identity vstupují do běžných obchodních výběrů a automatických týmových defaultů. |
| R24-006 | P1 | asset manager | mapa výročního reportu | MITIGATED | Geokódování přijalo chybný bod adresy bez upozornění nebo potvrzení uživatelem. |
| R24-007 | P2 | senior graphic designer / novic | informační bloky | FIXED_CI_LIVE | Obecná komponenta `notice` slepuje tučný titulek s navazujícím textem bez mezery. |
| R24-008 | P1 | novic / technický správce | založení úkolu | RETEST_FOLLOWUP | Formulář nového úkolu bez kontextového odkazu předvybere první objekt v seznamu. |
| R24-009 | P2 | novic / interní asistentka | platby a rozsáhlé výběry | FIXED_CI_LIVE | Ruční platba používá dlouhý plochý select bez hledání nebo filtrování. |
| R24-010 | P1 | technický správce | uzavření a znovuotevření | FIXED_CI_LIVE | Hotový úkol nemá řízené znovuotevření, ale příslib úhrady jej přepne do WAITING. |
| R24-011 | P1 | účetní / technický správce | nákladový lifecycle | FIXED_CI_LIVE | Ručně založený závazek nelze v UI převést na skutečnost ani opravit. |
| R24-012 | P2 | účetní | rozdělení nákladů | FIXED_CI_LIVE | Zobrazené zaokrouhlené řádky rozdělení nesouhlasí se zobrazeným celkem. |

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

Skutečné role a scope byly ověřeny nad osmi deterministickými identitami v izolované CI databázi. Stejných osm označených účtů je aktivních také v trvalém sandboxu. Trvalý sandbox byl dále procházen přihlášeným administrátorem; samostatné živé přihlášení každým účtem nebylo provedeno. Přihlášení je dostupné pouze přes bezpečný browserAuth handoff, proto živý vizuální průchod každým účtem zvlášť zůstává otevřený. To neoslabuje CI důkaz serverového scope, ale audit zůstává `IN_PROGRESS` a neoznačuje neprovedené role ani storage lifecycle za hotové.

## Kandidáti do následné pipeline

Prioritizované bloky a jejich testovací brány jsou doplněné v [návrhu opravné pipeline](../r24-repair-pipeline.md). Následující původní seznam zachovává kontext prvního průchodu.

1. P0/P1 bezpečné oddělení interních a vlastnických záznamů v úkolech a přílohách.
2. P1 označení a izolace testovacích/service identit od obchodních defaultů a výstupů.
3. P1 validace geokódu a potvrzení nejednoznačné adresy.
4. P1 bezpečný prázdný default objektu při globálním založení úkolu.
5. P1 jednoznačná reportová navigace a aktivní stav.
6. P1 sandboxové dokumentové úložiště a pozdější izolovaný Google Drive integrační gate.
7. P2 oprava landmarků obou reportových editorů, notice spacing a škálovatelných vyhledávacích výběrů.
8. Dokončit živé vizuální rolové průchody bezpečnou autentizací a potom uzavřít výslednou opravnou pipeline.

## Mutační pokračování 8. 9. 2026

Výchozí kód: PR #84, `c8a4aaeee8409077a3a2f5aafa4b34c5726bb39b`. Živé kroky proběhly v přihlášené relaci **UX Sandbox Admin**, s odbornými optikami uvedenými v tabulce; nejde o důkaz přihlášení technického správce či účetního. Rozšířené povolení uživatele zahrnuje syntetické provozní, finanční a smluvní zápisy. Žádný e-mail, podpis, platba, publikace ani nevratné mazání nebyly provedeny. Dopis zůstal DRAFT, nebyl předán k odeslání.

### Provedené scénáře a výsledky

| Scénář | Výchozí stav a akce | Ověřený výsledek |
|---|---|---|
| TECH-01 | Existující R24 úkol OPEN; změna na IN_PROGRESS, URGENT, termín 7. 9.; přidání označené poznámky | PASS: stav, termín i poznámka uložené, historie změny dostupná. Historie používá anglické enumy IN_PROGRESS/URGENT. |
| TECH-02 | Pokus o uzavření bez komentáře, poté s označeným závěrem | PASS: prázdný komentář blokuje nativní validace; s komentářem stav Hotovo. |
| TECH-03 | Hotový úkol; hledání znovuotevření, následně příslib 1 234 Kč k 15. 9. | FAIL R24-010: řízené znovuotevření chybí; příslib uložen a stav změněn na Čeká na reakci. |
| COST-01 | Založení OPEX závazku 1 234,56 Kč, dodavatel a číslo R24-TEST-001 | PASS vytvoření; FAIL R24-011 při hledání přechodu na skutečnost. Vazba na úkol je jen v poznámce. |
| COST-02 | Vlastní podíly 60 % + 30 % | PASS: server vrací „Součet podílů musí být přesně 100 %. Nyní je 90 %.“ |
| COST-03 | Rovnoměrné rozdělení stejného nákladu | PASS: 100 % rozděleno; FAIL R24-012 ve zobrazeném součtu částek. |
| CRM-01 | Nový označený zájemce s adresou r24-crm-01@example.invalid; nabídka jednotky G-01 za 950 000 Kč | PASS: kontakt a příležitost uložené, řádek pipeline dostupný. |
| CRM-02 | U nabídky volba Opce podepsána bez ceny a data | PASS: „Nabídnutá nebo podepsaná opce vyžaduje cenu a datum platnosti.“ |
| CRM-03 | Cena opce 10 000 Kč, platnost 15. 10., reference R24_AGENT_QA_2026_09_TEST_OPTION_01; Rezervace / Opce podepsána → Uzavřeno / Opce využita | PASS: obě evidenční změny potvrzené; uzavřený obchod dostupný v zakládání uvítacího dopisu. Nejde o podpis ani právní převod. |
| WELCOME-01 | Uzavřený syntetický obchod; budoucí datum nabytí 15. 9.; vytvoření šablony | PASS: vznikla revize 1 ve stavu Koncept, návaznost na G-01 a prodávajícího. |
| WELCOME-02 | Změna předmětu a úvodu na TEST NEODESÍLAT; uložení | PASS: „Koncept byl uložen.“, náhled dostupný. DRAFT ponechán bez odeslání a bez příloh. |
| LEASE-01 | Volná AGT-DEEP3-U04, existující syntetický Tenant 01; smlouva 1. 10.–31. 12., nájem 10 000 + služby 2 000 | PASS: vznikly právě tři měsíční předpisy 12 000 Kč pro říjen–prosinec. |
| LEASE-02 | Změna nájmu na 11 000 Kč od 1. 11., důvod s markerem; preview a potvrzení | PASS: preview vybral pouze listopad a prosinec; po uložení říjen 12 000, listopad a prosinec 13 000 Kč. |
| LEASE-03 | Zrušení budoucí smlouvy s důvodem a potvrzením dopadů | PASS: jednotka Volná, smlouva dostupná v historii jako zrušená před začátkem; žádný záznam smlouvy ani osoby se nesmazal. |

### R24-010 – neřízené znovuotevření hotového úkolu

- Persona: technický správce; živé oprávnění administrátora.
- URL: `/ukoly/b3334543-dc2b-4081-b12e-970d0d29ed02`.
- Kroky: uzavřít úkol s komentářem TECH-02; v editaci je pouze stav Hotovo; ve stále dostupném composeru zvolit Příslib úhrady, vložit TECH-03, datum 15. 9. 2026 a částku 1 234 Kč, uložit.
- Očekávání: terminální stav mění pouze explicitní znovuotevření s důvodem; příslib u uzavřeného případu nesmí stav skrytě změnit.
- Skutečnost: úkol přešel z Hotovo do Čeká na reakci, získal nový termín a znovu se objevil mezi otevřenými úkoly objektu. Běžná editace znovuotevření nenabízí.
- Důkaz: DOM před a po TECH-03, potvrzení „Záznam byl přidán do vlákna.“; `app/api/tasks/[id]/entries/route.ts` při PROMISE bez podmínky zapisuje WAITING a nečistí closedAt. Zachování closedAt je doloženo kódem, nikoli přímým čtením sandbox DB.
- Scope: composer všech uzavřených úkolů; tento test byl provozní úkol bez smlouvy. Reprodukovatelnost 1/1.
- Akceptační test: DONE/CANCELLED + PROMISE nesmí změnit stav ani termín; explicitní reopen zaznamená důvod, vyčistí closedAt atomicky a funguje i při souběhu s jiným zápisem. CAPEX zůstane pod svým řízeným lifecycle.

### R24-011 – přerušený lifecycle ručně evidovaného nákladu

- Persona: technický správce / účetní; živé oprávnění administrátora.
- URL: `/nemovitosti/cmtlxsapt0005un2a5u7o803g/naklady/cmtsr4v9m000bts29qq5wdpye` a finance téhož objektu.
- Kroky: založit COST-01 jako Objednáno, otevřít detail a hledat opravu částky či změnu na Skutečnost.
- Očekávání: tentýž náklad projde Plán → Objednáno → Skutečnost, se zachováním ID, dokladu, alokací a historie; není nutné přidat další započítávaný řádek.
- Skutečnost: detail nabízí pouze účetní podklady a rozdělení. Přehled má pouze přidání nákladu. Pro ruční náklad existují API create a allocations, nikoli update lifecycle.
- Důkaz: uložený detail COST-01 a kontrola `app/api/properties/[id]/costs`. Scope: ručně zakládané náklady, nikoli samostatná CAPEX realizace. Reprodukovatelnost 1/1.
- Akceptační test: na jednom ID převést plán na závazek a skutečnost; KPI nesmí dvojitě započíst starý závazek, alokace a doklady zůstanou; korekce má autora, důvod a historii. Přechod nezakládá bankovní platbu.

### R24-012 – zaokrouhlení skrývá kontrolovatelný součet

- Persona: účetní; živé oprávnění administrátora.
- URL a data: detail COST-01 výše; vstup 1 234,56 Kč, rovnoměrné rozdělení mezi tři jednotky.
- Kroky: uložit částku se dvěma desetinnými místy, zvolit Rozdělit rovnoměrně, porovnat řádky a Celkem.
- Očekávání: účetní detail zobrazí přesné částky na haléře a umožní ověřit součet.
- Skutečnost: řádky 412 Kč + 411 Kč + 411 Kč, Celkem 1 235 Kč. Z viditelných částek vychází 1 234 Kč. Tento nález nedokazuje chybu uložených haléřů.
- Důkaz: DOM tabulky rozdělení; podíly 33,34 % / 33,33 % / 33,33 %. Scope: účetní detail a jeho alokační tabulka. Reprodukovatelnost 1/1.
- Akceptační test: haléřová fixture a tři alokace mají přesně zobrazený součet; kompaktní KPI mohou zaokrouhlovat, účetní detail zachová dvě desetinná místa.

### Trvalá testovací stopa tohoto pokračování

- Technický úkol: `b3334543-dc2b-4081-b12e-970d0d29ed02`, v době původní reprodukce WAITING; po A-RETEST-02 OPEN; historie TECH-01 až TECH-03 ponechána.
- Náklad: `cmtsr4v9m000bts29qq5wdpye`, po C-RETEST-01 Skutečnost, rovnoměrně rozdělený, bez příloh, propojený s technickým úkolem.
- CRM: `R24_AGENT_QA_2026_09 · CRM-01 Testovací zájemce`, kontakt `r24-crm-01@example.invalid`, příležitost G-01 Uzavřeno / Opce využita.
- Dopis: `cmtsr9osg0012ts29zgwzxrni`, DRAFT, revize 1, předmět `R24_AGENT_QA_2026_09 · WELCOME-01 · TEST NEODESÍLAT`, syntetické datum nabytí 15. 9. 2026.
- Nájem: `cmtsrbnmo001ats29i28ttnkp`, číslo `R24_AGENT_QA_2026_09_LEASE_01`, zrušen před začátkem, jednotka `cmtofqovr003aub2abyxrfwy7` volná.

### Zbývající důkazní mezery

Tento blok obsahuje 14 živých scénářů výše, není novým automatickým browser gate. Původních 58 CI scénářů nesmí být vydáváno za pokrytí těchto nových mutací. Původní mezery souběhu, duplicit a retry nyní částečně pokrývají nové izolované regrese níže. Nadále zbývá souběh dvou různých živých uživatelů, samostatné přihlášení osmi živých rolí, celý lifecycle revizí a příloh, faktický převod účinného vlastníka a širší postprodejní úkoly. Odeslání dopisu a veřejná publikace jsou mimo povolený rozsah. Audit proto nadále `IN_PROGRESS`; návrh pipeline je průběžný, nikoli potvrzení produkční připravenosti.

## Opravná pipeline – výsledky 8. 9. 2026

Každý blok má samostatný PR, kompletní CI na aktuálním head a merge výhradně do sandbox/ux-agent. CI znamená oba joby build a browser-smoke včetně migrací, produkčního sestavení a všech verifikátorů. Níže uvedené počty jsou počty testů v Playwright runneru; zahrnují browserové i čistě databázové/fixture integrační scénáře, nejsou počtem nových živých průchodů.

| Blok | Důkaz / stav |
|---|---|
| A / R24-010 | PR #86, merge 4954197c. CI 34241405916 SUCCESS, 62/62 (58 původních + 4 nové lifecycle regrese). |
| C / R24-011 | PR #87, merge ca0d8d83. CI 34243574781 SUCCESS, 65/65. Tři nové scénáře: přechody na stejném ID se zachováním dokladových metadat a alokací, souběh stejné verze, cizí scope a záporná částka. Živý storage není tímto ověřen. |
| D / R24-012 | PR #92, merge 41b20182. CI 34246067337 SUCCESS, 67/67. Přesné dvě desetinné pozice a součet tří viditelných alokací. |
| E / R24-005/008 | PR #88, merge aab14f56. CI 34246014053 SUCCESS, 68/68. Explicitní isTestIdentity a prázdný globální objekt; historické snapshoty se nepřepisují. R24-005 je pouze částečně opraven: řešeny automatické reportové týmy a jejich TEST výběr, nikoli všechny obchodní číselníky. |
| F / R24-001/003/007/009 | PR #89, merge e2ff4f2c. CI 34243847784 SUCCESS, 62/62; rozšířeny původní scénáře klávesnice, navigace a čitelnosti. |
| G / R24-006 | PR #90, merge 56538766. CI 34244893248 SUCCESS, 64/64. Dva nové scénáře kvality fixture a browser návrh → neuložený reload → potvrzený zápis. Textová shoda není prostorová přesnost; původní chybný bod není tímto automaticky opraven. |
| I / pokrytí | PR #91; distribuční souběh a retry již prošly izolovaným CI 34244062353 (63/63). Dvě nové kontroly šířky 390/640 px prošly v CI 34246355622 SUCCESS (70/70 na tehdejší sestavě). Finální integrační gate zahrne všechny sloučené bloky, celkem 72 scénářů včetně navazujícího E2: 58 výchozích + A 4 + C 3 + E 1 + E2 1 + G 2 + I 3. D a F rozšířily existující testy bez navyšování počtu. Finální výsledek a merge jsou autoritativně u PR #91. |
| B / R24-002 | IMPLEMENTED: uživatel schválil migrační politiku 2026-09-08. Historie OWNER_VISIBLE, nové INTERNAL; přílohy, vyhledávání, reportové kandidáty, roční evidence a koncept uvítání sdílejí ochranu. Podrobnosti v [bránách B/H](../r24-storage-and-visibility-gates.md). |
| H / R24-004 | BLOCKED_CONFIG: izolovaný storage a přístup ke konfiguraci sandboxu. Kontrakt driverů ověřen lokálně 44 kontrolami; není to živý upload gate. Render plugin byl nabídnut, připojení ani izolovaný bucket nejsou doloženy. |

### Živé retesty po opravách

- A-RETEST-01/02, 15:06–15:07 UTC: Hotovo nenabízí Příslib úhrady; prázdný důvod reopen blokuje formulář. Označený důvod otevřel stejný případ a zůstal ve vlákně vedle původní historie. closedAt a souběh jsou doloženy CI DB.
- C-RETEST-01, 15:31 UTC: COST-01 převeden Objednáno → Skutečnost na ID cmtsr4v9m000bts29qq5wdpye, 1 234,56 Kč zachováno, podíly 33,34/33,33/33,33 %. Důvod s markerem uložen, historie ukazuje přechod; technický úkol b3334543-dc2b-4081-b12e-970d0d29ed02 a náklad mají obousměrné odkazy. Nevznikla bankovní platba.
- F: výroční editor má jeden main a aktivní pouze Akcionářské reporty. Titulek notice končí na 375,39 px, text začíná na 378,39 px. Výběr ruční platby nabízí 39 vztahů; marker LEASE_01 nalezne zrušenou testovací smlouvu, ArrowDown + Tab ji vybere a filtr bez výsledků zachová ID. Formulář nebyl odeslán. Zoom příkaz neměl měřitelný účinek (DPR stále 1), 200% zoom zůstává neověřený. Úzký viewport v CI není totéž co skutečný browser zoom.
- G-RETEST-01: po nasazení viditelný checkbox potvrzení a popis neuložených návrhů. Ruční změna šířky 49.1428661 → 49.15 bez potvrzení vrací „Změnu polohy potvrďte až po kontrole souřadnic.“ Uložený snapshot zůstává 49.1428661 / 16.6528369. Geokódovací služba nebyla volána; žádná nová poloha se neuložila.
- WELCOME read-only: dopis cmtsr9osg0012ts29zgwzxrni zůstává Koncept, revize 1, TEST NEODESÍLAT; žádné odeslání ani předání do Ready.

D-RETEST-01 po nasazení: 411,60 + 411,48 + 411,48 Kč = 1 234,56 Kč; účetní kontext, patička i historie nyní zobrazují přesné haléře. Živý retest E odhalil navazující E2 níže; jeho následná evidence a finální CI jsou doplněny v PR #91. Stav FIXED_CI není tvrzením o nasazení do běžící služby.

### Navazující živý retest E2

PR #93 vznikl z dalších dvou reprodukcí R24-008/005: klientský přechod z /ukoly/novy?propertyId=… na globální odkaz ponechal předchozí propertyId v React stavu; osm živých QA účtů založených přes UI nemělo původní title marker, proto je migrace z #88 neoznačila.

Oprava klíčuje formulář dvojicí propertyId/leaseId a přidává aditivní backfill přesně osmi dvojic email/jméno, ověřených 8. 9. v živém seznamu účtů. Žádná heuristika podle domény či role, žádná změna oprávnění, aktivity, hesel ani reportové historie. Nový DB test spouští skutečné SQL, vyžaduje změnu 8 řádků, retry 0, zachování scope a nedotčený podobný účet. Browser regrese prochází skutečný klientský odkaz; tvrdá navigace samotná chybu neodhalovala. Finální CI, merge a následný živý důkaz jsou u [PR #93](https://github.com/osoha/flatcloud/pull/93) a integračního [PR #91](https://github.com/osoha/flatcloud/pull/91).

### Zbytkové riziko a další pořadí

1. B: schválit konkrétní politiku viditelnosti, poté samostatný bezpečnostní PR a úplná matice přímých i odvozených cest.
2. H: připojit konfiguraci sandboxu a izolovaný TEST storage; provést skutečný upload/preview/download/verze/zotavení bez produkčních dat.
3. Dokončit živé přihlášení osmi rolí, úplný lifecycle revizí, účinné vlastnictví a širší postprodejní návaznosti; přesný geokód problematické adresy a skutečný 200% zoom.
4. Rozšířit politiku testovacích identit na zbývající obchodní výběry bez odebrání QA oprávnění.

Audit zůstává IN_PROGRESS. Odesílání, veřejná publikace, skutečné platby, main, produkce a nevratné mazání nebyly provedeny. Nový CRM test ověřuje jednu příležitost, jeden DRAFT revize 1 a null sentAt/readyAt při souběhu a retry v izolované CI DB; není důkazem reálného převodu vlastnictví.


### Doplnění H – 2026-09-09

Schváleno sdílené Google OAuth a samostatný kořen `00_Aplikace_Sandbox`. Připravena ochrana skutečné cesty souborů a zákaz nevratného cleanupu; 12 providerových regresních scénářů. Přihlášení do nové browser session a živá kontrola existujících vazeb/úložiště zůstávají otevřené. Přímý read-only DB konektor Render selhal na TLS. R24-004 není uzavřen; konkrétní nastavení a postup jsou v [bránách B/H](../r24-storage-and-visibility-gates.md).

### H – pokračování a oprava náhledu, 2026-09-09

Zdroj předchozího nasazení: [PR #95](https://github.com/osoha/flatcloud/pull/95), merge `3ad0e58a60b0bb7014e61ada96fa3d847407bc5c`, CI `34317040881` 97/97. Podrobný deployment log je v popisu PR. OAuth již funguje, čtyři podsložky byly připraveny a `FILE_STORAGE_DRIVER=gdrive`; starší BLOCKED_CONFIG výše je historický, nikoli současný stav.

| Druh důkazu | Výsledek |
|---|---|
| Uživatelem ověřeno 2026-09-09 | H-01: zobrazení PNG, stažení PNG a PDF GREEN. Záměrně neopakováno; cloudová URL security policy download zakázala a není obcházena. |
| Předchozí živý důkaz | Interní poznámka H-01 v úkolu `b3334543-dc2b-4081-b12e-970d0d29ed02`, PDF `cmtubkf5s0003qz2an2608ayh`, PNG `cmtubkf640009qz2a871xd3nl`. Historie zachována. Před uploadem 0 property vazeb / 0 FileAssets. |
| Nová živá kontrola | SUPER_ADMIN UI dostupné. Náklad `cmtsr4v9m000bts29qq5wdpye` u `cmtlxsapt0005un2a5u7o803g` ověřen jako syntetický COST-01, 1 234,56 Kč, 3 alokace a historie beze změny, před testem bez příloh. |
| Neplatný soubor → retry | Příprava formuláře H-02 proběhla. Výběr souboru cloudovým file chooserem se zasekl; následující DOM kontrola ukázala prázdný file input a žádné přílohy. Další pokus o výběr opět nedokončen, následně nereaguje ani čtení stránky. **NEOVĚŘENO**, nikoli aplikační PASS ani dokázaná chyba serveru. Neopakovat submit bez kontroly stavu. |
| Automatické lokální ověření | TypeScript PASS, Drive statické kontroly 44 + 44, R24 10, izolované providerové testy 12/12 PASS, diff check PASS. Lokální Next build blokuje zděděný node_modules symlink mimo Turbopack root; plný build a migrace jsou povinné v CI. |
| Nové UI regrese | 3 scénáře desktop/mobile/error-retry: nativní modalita, křížek/Esc, návrat focusu, nezměněná URL, zachování rozepsaného komentáře a historie. Image transport je pouze CI fixture, nikoli důkaz živého Google Drive. Výsledek plného CI a nasazení bude uveden v opravném PR. |

Oprava používá společnou komponentu příloh: přístupný nativní dialog místo navigace na obrázek, označené zavření, focus a scroll návrat, chybový stav/retry. Beze změny serverové autorizace, storage endpointu, sdílení či oprávnění; původní download zůstává zachován.

Implementační a release evidence: [PR #96](https://github.com/osoha/flatcloud/pull/96); jeho popis eviduje finální CI na přesném SHA, merge pouze do sandboxu a Render deployment. První CI odhalilo zastaralou kontrolu umístění aria-label po extrakci komponenty; kontrola zachována a rozšířena o wiring/dialog labels. Browser gate odhalil únik Tab focusu do lišty prohlížeče: doplněn cyklus Tab/Shift+Tab, včetně error/retry stavu. Esc nyní nezasahuje do otevřeného panelu na pozadí. Následně opravena chyba testového přenosu `scrollBefore` do browser evaluate (beze změny očekávání). Desktop a 390px screenshoty z CI vizuálně zkontrolovány; jde o syntetickou UI fixture, nikoli živou Drive fotografii. Žádný neúspěšný test nebyl odstraněn nebo přeskočen. Read-only dotaz sandboxového PostgreSQL znovu skončil EOF / SSL-TLS required; nedokládá skutečné ancestry.

**H zůstává IN_PROGRESS / LIVE_GATE_BLOCKED**: chybí dokončená příloha nákladu, neplatný upload a úspěšné zotavení, živé VIEW/EDIT/cizí vlastník a post-upload kontrola skutečných vazeb pod sandboxovým kořenem. Funkční relace prohlížeče a bezpečné role login jsou potřeba k dokončení. Dosavadní user-green nenahrazuje tyto testy. Main, produkce, e-maily, platby, veřejná publikace a mazání zůstaly nedotčeny.


### H – živé testy a obnova testovacích přístupů, 2026-09-11

- **Živě GREEN:** nasazený H-01 modal načetl skutečné PNG (1000×600); Esc/křížek, Tab containment, návrat focusu, zachování URL a neodeslaného konceptu. Původní uživatelská potvrzení PNG/PDF downloadu z 9. 9. zůstávají samostatným důkazem; zakázaný cloudový download nebyl opakován.
- **Živě GREEN:** COST-01 `cmtsr4v9m000bts29qq5wdpye` odmítl syntetické neplatné PNG hláškou `File content does not match its MIME type.` bez přílohy. Následný platný PDF upload uspěl: dokument `cmtwnwqjt0005zm1sgkal4vvj`, `R24_AGENT_QA_2026_09 · H-02 · Příloha nákladu po odmítnutí`. Částka 1 234,56 Kč, tři alokace a historie zachovány.
- **Připravené role fixtures:** úkol `4948d2e0-8d23-49f1-96a2-1ab4e65b35cc`, Dům ve správě `cmtlxai130051un5dkqqk84g0`, označení `R24_AGENT_QA_2026_09 · H-ROLE`. Interní PNG `cmtwo364u000fzm1syk2r85p3`, vlastníkovi viditelné PNG `cmtwo48lp000nzm1sp44l4twv`.
- **Živě GREEN:** následný administrátorský audit skutečných cest ověřil 2 složkové vazby / 5 FileAssets včetně variant pod sandboxovým kořenem `1Eh4zB2CZutxJmlK2O8_U5E8OqPUjFOMG`. Čtyři nastavené podsložky beze změny.
- **Zbývá:** živé VIEW / EDIT / cizí vlastník. Role `r24.external-owner@flatcloud.test` (VIEW Dům ve správě) a `r24.units@flatcloud.test` (EDIT tentýž dům) existují, ale jejich bezpečně předané přístupy nebyly doloženy. Předchozí browserAuth skončilo administrátorem; nejde o průchod omezenou rolí.

Uživatel výslovně povolil obnovu těchto testovacích přístupů přes administraci. Ta dosud neobsahovala reset cizího hesla. Navazující oprava přidává standardní reset pro SUPER_ADMIN, vyžaduje jeho aktuální heslo, explicitní potvrzení a důvod. Nepovoluje reset vlastního ani jiného SUPER_ADMIN účtu nebo deaktivovaného účtu. Žádné granty nemění ani nevytváří testovací autentizační zkratku, session nebo e-mail. Nová hesla se zadávají ručně v předaném prohlížeči; agent je nečte ani negeneruje pro živé účty.

**Riziková oblast: autentizace**, schválená uživatelem pro sandboxovou obnovu. Přibývá aditivní `User.sessionVersion` s výchozí nulou; reset ji atomicky zvýší spolu s heslem a auditem bez tajných hodnot. Dosavadní JWT s nulovou nebo chybějící verzí zůstávají platné pouze do resetu daného účtu. Přihlášení používá verzi z ověřeného credential snapshotu; přijetí pozvánky odmítne mezitím změněné heslo/verzi. Vlastní změna hesla zneplatní ostatní relace a obnoví pouze relaci, která změnu provedla.

Lokální policy/session regrese a TypeScript prošly. Lokálně není izolovaný PostgreSQL; databázové migrace, build a tři nové browser/integration scénáře musí projít v kompletním CI před merge. Finální SHA, CI, merge, nasazení a předání resetu budou doloženy v opravném PR. **H zůstává IN_PROGRESS**, živý reset a role testy nejsou vydávány za hotové.


První CI obnovy `34595610336`: build/migrace/statiky GREEN, browser 99/103. UI reset proběhl; tři nové API scénáře odhalily chybějící přenos Secure cookie přes izolované HTTP. Testovací helper nyní předává beze změny skutečnou cookie vydanou běžným login endpointem a před odvoláním ověřuje platnost relace. Zabezpečení aplikace se kvůli testům nemění. Dočasné identity se po každém testu deaktivují, aby neovlivňovaly stávající reportový test (jeho očekávání 8 identit zůstává zachované). Žádný test nebyl přeskočen; následuje celé CI na opraveném SHA. Implementační a finální release evidence: [PR #97](https://github.com/osoha/flatcloud/pull/97).


## H — finální živé role a uzavření (2026-09-11)

Tato část nahrazuje starší průběžné stavy H. Funkční a živé brány H jsou splněny; uzavírací dokumentační PR musí před merge projít celým CI. R24 jako celek se tím neuzavírá.

| Typ důkazu | Výsledek a rozsah |
|---|---|
| Uživatel | Potvrdil dokončený reset Externího vlastníka i Správce jednotek. Z dřívější kontroly zůstává GREEN zobrazení PNG a stažení PNG/PDF; download neopakován. |
| Živá autentizace | Oba účty přihlášeny běžným přihlášením přes bezpečný browserAuth / uživatelské převzetí. Čerstvé UI jednoznačně potvrdilo `r24.external-owner@flatcloud.test` / Vlastník, 1 objekt a `r24.units@flatcloud.test` / Správce nemovitosti, 1 objekt. |
| Živé VIEW | H-ROLE `4948d2e0-8d23-49f1-96a2-1ab4e65b35cc`: vlastník vidí pouze OWNER_VISIBLE poznámku a PNG `cmtwo48lp000nzm1sp44l4twv`. INTERNAL poznámka, systémová historie a formulář zápisu chybí. Modální obrázek skutečně načten 1000 × 600; Esc zavře dialog a URL úkolu zůstane stejná. |
| Živý cizí scope | Stejný přihlášený vlastník při přímé navigaci na H-01 úkol `b3334543-dc2b-4081-b12e-970d0d29ed02` a COST-01 detail `/nemovitosti/cmtlxsapt0005un2a5u7o803g/naklady/cmtsr4v9m000bts29qq5wdpye` dostane 404 bez obsahu. |
| Živé EDIT | Správce jednotek ve stejném H-ROLE vidí OWNER_VISIBLE i INTERNAL PNG `cmtwo364u000fzm1syk2r85p3`. Interní náhled skutečně načten 1000 × 600, zavřen tlačítkem. Interní zápis `R24_AGENT_QA_2026_09 · H-ROLE-EDIT-RETEST` úspěšně uložen, UI potvrdilo autora a hlášku „Záznam byl přidán do vlákna.“ (14:59 dle UI). Předchozí historie zachována. |
| Živé upload/retry/ancestry | Dříve doložené H-01 PDF/PNG a COST-01 invalid PNG → valid PDF GREEN. Finální audit provideru: 2 property folders / 5 FileAssets pod sandboxovým kořenem. V této etapě přibyla jen textová poznámka, žádný nový soubor ani složka. |
| Automatické autorizace | Izolované CI pokrývá přímé download/preview varianty, skryté metadata, katalog, reporty a zápisovou role/scope matici v `e2e/zzz-r24-task-visibility.spec.ts`. Nezaměňovat za živý download test: cloudová URL security policy se neobcházela. |
| Automatické opravy a release | PR #95: 97/97. PR #96: CI 34401341795, 100/100, merge `dfc5e2667a7bf10ce4254bc75f1cfcac0b76cc05`, modal živě ověřen. PR #97: CI 34596527958, 103/103 bez retry včetně build/migrací; merge `58d1a313feb99068cd1ac502963f9e11a7f9c90f`. Render deploy `dep-dahutkqd0e5s73c3l9r0` LIVE od 2026-09-11T12:09:38.479819Z, nové účty následně živě použity. |

H je doložen kombinací automatických testů, živých rolových a storage kontrol a explicitně uživatelského ověření downloadu. Nejde o tvrzení, že agent živě otestoval každou API mutaci nebo download. Schválené sdílené OAuth a aplikační izolace pod `00_Aplikace_Sandbox` zůstávají beze změny. Účty nedostaly nové granty. Žádné produkční změny, skutečné e-maily, platby, publikace ani nevratné mazání.

Finální CI, merge a nasazení tohoto dokumentačního uzavření budou zaznamenány v jeho PR; nevytváří se další kódová oprava ani nová autentizační cesta.


## I — pokračování po uzavření H (2026-09-11)

Živá identita: `r24.units@flatcloud.test`, Správce nemovitosti, EDIT pouze Dům ve správě. Načtení po deploy PR #98 green. Vytvořena revize `cmtx4b6ud0001u22ammegpvh1` u `cmtlxai130051un5dkqqk84g0`, název `R24_AGENT_QA_2026_09 · I-REV-01 · Syntetická kontrola`, kategorie `R24_AGENT_QA_2026_09_TEST`, periodicita 12 měsíců, původní termín 10. 9. 2026. UI potvrdilo vytvoření a „Po termínu 1 dní“. Dne 11. 9. zaznamenáno syntetické provedení, výsledek OK, technik a poznámka s markerem. Nejde o reálnou revizi. Další termín 11. 9. 2027, souhrn 1 aktivní / 0 do 60 dnů / 0 po termínu. Audit aktivity potvrdil autora a „Revize provedena“. Nebyl přidán soubor ani změněna předchozí historie.

### R24-013 — nedostupná historie revizí

Živě reprodukováno: po uložení a při opětovném vstupu přes Detail z globálních revizí chybí datum provedení, výsledek, technik, poznámka a historie protokolů. Provozní karta zobrazuje pouze další termín a formulář Provedeno; deník uvádí jen stručnou systémovou událost. Kód načítal poslední tři `records`, ale vůbec je nevykresloval.

Oprava: rozbalovací Historie kontrol se všemi záznamy, stabilní sestupné pořadí, technik/autor/poznámka/výsledek/tehdejší navazující termín a standardní DocumentAttachments. Dotaz načítá historii jen v provozní sekci, používá stávající `documentAccessWhere` a nepřidává endpoint ani oprávnění. Regresní CI scénáře: pět záznamů včetně nejstaršího protokolu, nové provedení z UI, správný termín a počet záznamů; VIEW smí historii číst bez dokončovacího formuláře, unit-only a cizí scope mají 404, odstraněný protokol není zveřejněn. Metadata-only protokol v CI není živý upload/download důkaz.

R24 zůstává IN_PROGRESS; oprava R24-013 musí projít celým CI, merge pouze do sandboxu a živým retestem. Vývojový výhled v pipeline doplněn o externí distribuci / přípravu partikulí v CRM jako poslední blok s dosud neuzavřeným briefem.
