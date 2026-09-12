# R24 – agentní testování před lidskou a zátěžovou kontrolou

## Cíl a důkazní standard

R24 testuje FlatCloud jako propojení správy nemovitostí, distribučního CRM, reportingu vlastníkům a postprodejní péče. Každý živý nález musí obsahovat roli, výchozí data, přesné kroky, očekávaný a skutečný výsledek, URL, scope, reprodukovatelnost, důkaz a návrh akceptačního testu. Samotná domněnka není nález.

Veškerá živá data používají prefix `R24` nebo marker `R24_AGENT_QA_2026_09`. Nic se v sandboxu nemaže. Automatická komunikace, publikace, podpis, platba, právní účinnost a produkční změna končí před posledním potvrzením.

## Role

| Role | Aplikační oprávnění | Hlavní úkol |
|---|---|---|
| Uživatel novic | jedna jednotka, VIEW | orientace, průvodci, chyby a další krok |
| Pokročilý uživatel | jeden objekt, EDIT | rychlá práce, filtry, dávky a návrat |
| Externí vlastník | externí objekt, VIEW | finance, dokumenty, reporty a izolace dat |
| Šéf distribuce | globální manager | CRM, nabídka, opce/prodej, nabytí a uvítací péče |
| Interní asistentka | vybrané objekty, EDIT | hledání, kontrola dat a příprava podkladů bez schvalování |
| Technický správce | jeden objekt, EDIT | závady, úkoly, revize, důkazy a náklady |
| Správce jednotek | externí objekt, EDIT | jednotka, nájem, předání, dluh a ukončení |
| Asset manager | globální manager | KPI, zdroje, Q4, výroční report a uzávěrka |
| Graphic designer | read-only odborný pohled | typografie, layout, responsive a PDF |
| Product developer | read-only odborný pohled | handoffy, fronty a tržní best practices |
| Právník / document controller | read-only odborný pohled | vzory, verze, schválení, podpis a účinnost |
| Účetní / financial controller | odborné potvrzení | cut-off, doklady, úroky, opravy a exporty |
| Bezpečnostní administrátor | audit oprávnění | least privilege, přímé URL, relace a exporty |
| Specialista přístupnosti | read-only odborný pohled | klávesnice, fokus, labels, zoom a pohyb |

První osm rolí má deterministickou CI identitu. Odborné role jsou testovací optiky, nikoli nové produkční role.

## Povinné lifecycle scénáře

| Priorita | Lifecycle | Varianty |
|---|---|---|
| P0 | Role a scope | menu, globální hledání, přímá URL, export, cizí SPV, jednotkový scope |
| P0 | Distribuce | nový zájemce, dvě příležitosti, změna ceny, opce, WON/LOST, souběh, historie |
| P0 | Postprodejní péče | nabytí dle KN, účinný vlastník, koncept uvítání, přílohy, retry, ruční gate |
| P0 | Nájem | objekt, jednotka, nájemník, smlouva, předpis, platba, kauce, valorizace, ukončení |
| P0 | Technická správa | závada, priorita/SLA, řešitel, termín, důkaz, náklad, faktura, uzavření, znovuotevření |
| P0 | Reporting | LIVE data, snapshot, Q4, výroční revize, změna scope, publikace a neměnnost |
| P0 | Integrita | duplicity, překryvy, neplatné částky/data, dvojklik, retry a dva souběžní uživatelé |
| P1 | Owner self-service | finance, dokumenty, opravy, interní poznámky, skončený přístup a bezpečný export |
| P1 | Dokumenty | upload, preview, download, MIME/velikost/hash, vazby, nedostupnost a orphan |
| P1 | UX | desktop, mobil, prázdný/plný/chybový stav, klávesnice a 200% zoom |
| P2 | Doporučení | vysvětlitelný zdroj, možnost odmítnutí a žádný autonomní právní/finanční účinek |

## Provedení

1. `e2e:seed` vytvoří běžná demo data v čisté CI databázi.
2. `e2e:seed:r24-roles` idempotentně doplní osm omezených testovacích identit. Nikdy se nespouští automaticky v produkci ani v běžném sandbox deployi.
3. `zz-r24-agent-roles.spec.ts` ověří skutečné obrazovky v Chromiu a serverové odmítnutí cizího scope.
4. Cloudový průchod použije stejnou matici nad trvalým sandboxem; zápisy jsou označené a bez mazání.
5. Nálezy se zapisují do `docs/audits/r24-agent-audit-2026-09-08.md`; opravná pipeline vzniká až po uzavření auditu.

## Simulace úložiště bez GDrive sandboxu

V CI se použije skutečný aplikační kontrakt přes lokální driver a syntetické malé fixture soubory označené `TEST`. Ověří se upload, download, metadata, MIME/size limit, checksum, oprávnění, nedostupnost, duplicitní požadavek a úklid osiřelého assetu. Fake/local stav se v UI nesmí vydávat za reálnou archivaci či doručení.

Samostatný budoucí integrační gate použije izolovaný Google Drive účet a jedinou testovací kořenovou složku. Ověří pouze provider-specific autentizaci, scope, změnu oprávnění, přesuny, limity a zotavení; nebude sdílet produkční OAuth credentials ani složky.

## Produktový benchmark

- record-level scope a audit oprávnění: [HubSpot](https://knowledge.hubspot.com/records/view-record-access),
- podmíněné stage gates: [Salesforce](https://help.salesforce.com/s/articleView?id=platform.fields_useful_validation_formulas_oppty_mgmt.htm&language=en_US&type=5),
- distribuční handoff do správy aktiva: [Dealpath](https://www.dealpath.com/),
- owner portal s financemi, dokumenty a údržbou: [Buildium](https://www.buildium.com/features/property-owner-portal/),
- inspekční nález navázaný na úkol a obrazový důkaz: [HappyCo](https://webflow.happy.co/media/tasks-deep-dive),
- brandovaný investor reporting a portál: [Juniper Square](https://www.junipersquare.com/platform/investor-reporting).

Benchmark určuje otázky testu, nikoli automatický požadavek kopírovat konkurenci.

## Právní dokumentová pipeline

1. Taxonomie odlišuje nájem, podnájem a jednotlivé právní scénáře.
2. Master je neměnná, časově účinná a právníkem schválená verze se stabilními clause ID.
3. Validátor blokuje nesprávné strany, překryvy, podnájem za koncem nájmu, chybějící souhlas a limit jistoty + pokuty.
4. Výstup ukládá vstupní snapshot, DOCX/PDF/A, přílohy a SHA-256; podepsaný dokument se neregeneruje z LIVE dat.
5. Workflow je draft → datová kontrola → právní kontrola → schváleno k podpisu.
6. Provider-neutral podpisový adaptér odděluje podpis od důkazu doručení.
7. Žádný dokument se sám neodešle ani nezmění stav nájemního vztahu.
8. Retence, minimalizace údajů, oprávnění a audit jsou součástí dokumentového spisu.

Autoritativní východiska: [MMR – nájemní vztahy](https://mmr.gov.cz/cs/ministerstvo/bytova-politika/najemni-vztahy), [e-Sbírka – občanský zákoník](https://e-sbirka.gov.cz/sb/2012/89?zalozka=text), [e-Sbírka – služby](https://e-sbirka.gov.cz/sb/2013/67?zalozka=text), [EUR-Lex – eIDAS](https://eur-lex.europa.eu/eli/reg/2014/910/oj/eng). Zvládneme.cz je pouze inspirační katalog, nikoli právní master.
