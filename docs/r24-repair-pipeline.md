# R24 – prioritizovaný návrh opravné pipeline

Podklad: [audit R24](audits/r24-agent-audit-2026-09-08.md), nálezy R24-001 až R24-012. Stav návrhu: průběžný po 14 mutačních scénářích dne 8. 9. 2026. Původní auditní PR #85 neobsahoval opravy. Uživatel následně spustil implementační pipeline.

Každý blok samostatně: pracovní větev ze současné `sandbox/ux-agent` → relevantní regresní testy → PR s base `sandbox/ux-agent` → kompletní CI build, migrace a browser-smoke na aktuálním SHA → kontrola diffu → merge pouze do sandboxu → živý retest. Bez úprav `main`, produkce, skutečné komunikace či plateb, publikace a nevratného mazání. Chybějící či neúspěšný důkaz blokuje merge; nesnižovat přísnost gate.

| Pořadí / blok | Priorita a nálezy | Rozsah a výsledek | Povinný důkaz před merge |
|---|---|---|---|
| A – integrita úkolu | P1, R24-010 | Explicitní reopen s důvodem; příslib nezmění terminální úkol. Atomické změny stavu a closedAt. | Databázové testy DONE/CANCELLED, souběh uzavření a příslibu, UI reopen, CAPEX gate. |
| B – viditelnost vlákna | P1, R24-002 | Rozlišení interního a vlastnického záznamu včetně příloh a bezpečné migrační strategie. | OWNER_VIEWER nesmí číst interní obsah přes UI, URL ani export; zachování scope jednotky; migrační ověření. Migrační politika samostatně schválena uživatelem 2026-09-08. |
| C – životní cyklus nákladů | P1, R24-011 | Editace a audit Plán → Objednáno → Skutečnost na jednom ID; vazba na technický úkol. | Bez dvojího započtení, souběh změn, zachování alokací a dokladů, scope vlastníka, účetní období. |
| D – přesnost účetního detailu | P2, R24-012 | Haléřová přesnost v detailu a rozdělení nákladů. | Částka 1 234,56 Kč a tři jednotky: viditelné řádky i celkem souhlasí; beze změny výpočtu. |
| E – bezpečné výchozí hodnoty | P1, R24-005/008 | Prázdný objekt globálního úkolu; explicitní politika testovacích identit pro reportové defaulty. Testovací řešitel musí zůstat použitelný v QA. | Kontextový propertyId funguje jen pro dostupný objekt; globální submit vyžaduje volbu; testovací tým nevstoupí automaticky do reportu. Neomezovat přístupová práva rolí. |
| F – navigace a čitelnost | P1/P2, R24-001/003/007/009 | Jedna aktivní větev reportů, jeden main, mezery notice, vyhledávání nájemního vztahu. | Klávesnice, aktivní i historické vztahy, mobil, 200% zoom, reportové landmarky. |
| G – kvalita geokódu | P1, R24-006 | Viditelná míra shody a ruční potvrzení/korekce nejednoznačného bodu. | Fixture adres s různou kvalitou; bez posouvání celé mapy; chybový stav nezapisuje tichý chybný bod. |
| H – sandboxové dokumenty | P1, R24-004 | Izolovaný TEST storage, metadata/checksum a simulace selhání; následně vlastní izolovaný Drive gate. | Upload/preview/download/verze/zotavení a scope; žádný produkční účet; žádné destruktivní čištění v živém sandboxu. |
| I – dokončení R24 | P0/P1 pokrytí | Doplnit živé role, CRM duplicity/retry/souběh, revize, účinné vlastnictví a postprodejní návaznosti. | Nové behaviorální browser testy mají vlastní počet; jasně oddělit starých 58 scénářů, živé scénáře a nezměřené chování. Uvítání nejvýše DRAFT/preview, bez send. |

Nejprve A a C: oba blokují běžný provozní lifecycle. B má nejvyšší důležitost pro důvěrnost a musí mít před kódováním odsouhlasenou politiku viditelnosti starých záznamů. D lze řešit samostatně jako malou opravu čitelnosti. Ostatní bloky nenahrazují závěrečnou lidskou kontrolu a pozdější zátěžový test.

## Průběh implementace

| Blok | Výsledek opravné etapy |
|---|---|
| A | PR #86, sloučeno; celé CI 34241405916 SUCCESS, 62/62. Živý reopen s důvodem a terminální UI ověřeny. |
| C | PR #87, sloučeno; celé CI 34243574781 SUCCESS, 65/65. Živý přechod na stejném ID a obousměrná vazba úkolu ověřeny. |
| D | PR #92, sloučeno; celé CI 34246067337 SUCCESS, 67/67. Nové haléřové regrese prošly prvním během; starší očekávání celých korun bylo aktualizováno na přesná dvě desetinná místa. |
| E | PR #88, sloučeno; celé CI 34246014053 SUCCESS, 68/68 po vyřešení konfliktu s C. R24-005 zůstává částečný, ostatní obchodní výběry nejsou součástí tohoto bloku. |
| E2 | PR #93: živě nalezené zachování klientského kontextu a chybějící marker u osmi UI účtů. Klíčování formuláře, přesný idempotentní backfill a nové DB/navigační regrese. Konečný CI/merge a živý retest viz PR #93 a #91. |
| F | PR #89, sloučeno; celé CI 34243847784 SUCCESS, 62/62. Živě ověřeny reportové landmarky, notice a klávesnicový historický výběr bez zápisu platby. Skutečný 200% zoom je důkazní mezera. |
| G | PR #90, sloučeno; celé CI 34244893248 SUCCESS, 64/64. Živě odmítnut nepotvrzený posun souřadnic, původní bod zachován. Prostorová správnost adresy se tím nepotvrzuje. |
| I | PR #91: distribuční souběh/retry a dvě úzké šířky 390/640 px již prošly průběžným CI 34246355622 (70/70). Finální sestava včetně E2 má 72 scénářů. Finální integrované CI a merge jsou podmínkou dokončení této etapy; R24 jako celek zůstává IN_PROGRESS. |
| B | IMPLEMENTED: schválená viditelnost historie/nových záznamů, společná autorizace příloh a ochrana návazných podkladů; úplný CI gate a merge eviduje [PR #94](https://github.com/osoha/flatcloud/pull/94). |
| H | PR #95 merge `3ad0e58`, CI 97/97. OAuth, čtyři složky, H-01 upload/historie a uživatelem zobrazení PNG + PNG/PDF download GREEN. [PR #96](https://github.com/osoha/flatcloud/pull/96) implementuje modální náhled a 3 UI regrese; přesný finální CI/SHA/merge/deployment důkaz je veden v jeho popisu. Živý file chooser blokuje H-02 náklad/error-retry; VIEW/EDIT/cizí scope a post-upload ancestry neověřené. Historický stav; aktuální uzavření viz finální stav H níže. Postup a důkazy v [bránách B/H](r24-storage-and-visibility-gates.md). |

Neúspěšné běhy zůstávají v historii: A a C zpřesnily selektory a testovací session transport; G doplnil nové povinné potvrzení do původního ročního scénáře; D změnil očekávání účetního formátu. Žádný test nebyl přeskočen ani odstraněn kvůli selhání. Před merge musí být zelené celé CI na posledním SHA.

Další priorita: B (politika historie a interních poznámek) → H (izolovaný storage a živý gate) → zbývající živé role/revize/vlastnictví/postprodejní návaznosti → širší obchodní TEST výběry a 200% zoom. Podrobná evidence, omezení a testovací ID jsou v [auditu](audits/r24-agent-audit-2026-09-08.md).


Pokračování H, 2026-09-11: modal z PR #96 nyní ověřen i živě; COST-01, odmítnutí neplatného PNG + validní PDF retry, post-upload ancestry 2 složek / 5 souborů GREEN. Zůstávají živé omezené role. Schválená obnova přístupu vyžádala doplnění administrátorského resetu (ověření správce, audit, revokace relací, zachované granty); nový opravný blok podléhá kompletnímu CI/PR/merge gate a ručnímu zadání hesel. Finální release důkazy vede opravné PR. H není uzavřen.


## Finální stav H — 2026-09-11

Funkční i živé brány H splněné: OAuth/izolace, H-01 a COST-01 upload, invalid → valid retry, ancestry 2 folders / 5 FileAssets, modal včetně Esc/křížku a kontextu, skutečné VIEW/EDIT a cizí scope. Oba účty po uživatelském resetu úspěšně přihlášeny. EDIT uložil označenou interní poznámku; další soubor nevznikl. Download PNG/PDF zůstává uživatelem ověřený, přímá API autorizační matice automaticky testovaná; cloudový zákaz respektován.

- PR #96: CI 34401341795 100/100, merge `dfc5e2667a7bf10ce4254bc75f1cfcac0b76cc05`, modal nasazený a živě GREEN.
- PR #97: CI 34596527958 103/103 bez retry, merge `58d1a313feb99068cd1ac502963f9e11a7f9c90f`, Render `dep-dahutkqd0e5s73c3l9r0` LIVE 2026-09-11T12:09:38.479819Z. Reset a zachovaný scope potvrzeny živými rolemi.
- Uzavírací dokumentační PR: bez změny runtime; před merge povinné celé CI. Jeho finální SHA/CI/merge/deploy se doplní přímo do popisu PR. Po této bráně H = DONE; ostatní R24 mezery (širší role/revize/vlastnictví, TEST výběry, 200% zoom) se tím neoznačují za hotové.

Tato část nahrazuje starší průběžné blokace H výše. Úplná důkazní matice je v závěru auditu.


## Dokončení R24 po H — 2026-09-11

Uživatel potvrdil pořadí: nejprve dokončit R24, poté navázat vývojem. Nový živý retest Správce jednotek I-REV-01 ověřil vytvoření revize po termínu, zaznamenání provedení a posun 12 měsíců. Nalezen R24-013: historie uložených kontrol se v provozním detailu vůbec nevykresluje. Opravný blok doplňuje úplnou historii (ne pouze načtené tři poslední řádky), výsledek, technika, autora, poznámku a autorizované protokoly. Přímé document endpointy zůstávají pod stávající autorizací. Samostatné PR vyžaduje celé CI a živý retest.

Nadále otevřené: zbývajících šest živých účtů (dva ověřeny v H), souběh různých živých identit, účinné vlastnictví a postprodejní návaznosti, širší obchodní TEST výběry, přesný geokód problematické adresy a skutečný 200% zoom. R24 se neuzavírá pouhým uzavřením H nebo revizního retestu.

## Vývojový výhled po R24

Pracovní pořadí pro navazující briefy, nikoli tvrzení o dosud neexistujících funkcích:
1. Dotáhnout evidenci nákladů a ekonomiku domu (rozpočet/skutečnost, OPEX/CAPEX a úvěry).
2. Valorizace a scénáře budoucího cashflow.
3. Vyúčtování služeb a daňové podklady.
4. Dotáhnout interní distribuci, valuace, CRM/opce a postprodejní návaznosti.
5. Metodiky, mentoring, onboarding a multimediální obsah.
6. Reporty a manažerský přehled napříč vlastníky.
7. **Externí distribuce:** podpora distribučního manažera v CRM, zejména příprava partikulí prodávaných jednotek. Uživatel nepožaduje nutně realitní server. Rozsah, obsah partikulí, formáty, schvalování a případné sdílení se teprve společně upřesní v briefu před implementací; veřejné publikování tím není schváleno.
## Aktuální stav po živých rolích — 2026-09-11

PR #99: R24-013 DONE, historie revizí živě ověřena; merge ace262af77d03b4bc11094147cda02a746972288, CI 34617721743 SUCCESS 105/105 bez retry, Render dep-dai27095efls73as0p60 LIVE. H nadále DONE.

Všech osm identit má doložené živé přihlášení. Nově ověřeno uložení uvítacího DRAFT s existující přílohou, nákladové alokace, prázdný default správce, jednotkový scope, EDIT zápis asistentky a vytvoření/uzavření případu dvěma různými správci se zachováním historie. Podrobnosti a ID jsou v závěrečném doplnění auditu a PR #99.

R24 zůstává IN_PROGRESS: chybí skutečný 200% zoom, současné živé identity, přesný geokód problematické adresy a širší živé administrátorské TEST výběry. Účinný převod vlastnictví je blokován stávajícím deleteMany a absencí časové historie; nebyl proveden. Návrh zachování historie a odděleného potvrzení je v auditu. Pravidla účinnosti, scope a platebních návazností potřebují konkrétní lidské rozhodnutí dle AGENTS.md před implementací změn bezpečnostních/platebních hranic.

Externí distribuce / CRM partikule zůstává posledním budoucím vývojovým blokem s briefem k společnému dopracování.

## Schválená oprava vlastnictví — R24-014

Uživatel dne 2026-09-12 potvrdil zachování historie včetně archivovaných nemovitostí, odděleného potvrzení plateb a výslovný PR/merge do sandboxu. Implementace používá potvrzená období a úplné auditní snapshoty před/po změně; žádné mazání vlastnických záznamů. Historické doklady a granty se převodem nemění. Opravy období mají vlastní audit, původní hodnoty zůstávají dohledatelné. Podrobnosti, omezení na jednoho 100% vlastníka a čtyři nové E2E scénáře viz audit R24-014. Před označením DONE musí projít kompletní CI, merge, deploy a živý retest. Ostatní otevřené brány R24 tím nejsou uzavřeny.


## R24-015 — dostupnost historie v navigaci, 2026-09-12

R24-014: PR #101, merge `224f45e522a60a7a639900ab1bb52587f9c8c169`, celé CI 34686926134 SUCCESS 109/109 bez retry; Render `dep-daii51cs728c73aj4e90` LIVE. Živá příprava syntetického objektu P1015, jednotky a smlouvy je doložena v PR #101. Samotný živý převod ještě nebyl proveden.

Živý průchod odhalil chybějící odkaz na vlastnictví v nastavení objektu. R24-015 přidává odkaz „Vlastnictví a historie“ do nastavení a obecné editace. Obecná editace zobrazuje hlavního vlastníka bez nefunkční možnosti změny; změna vede přes potvrzený převod. E2E nyní vstupuje přes nastavení, včetně archivovaného objektu. Autorizace se nemění. Lokální TypeScript PASS. Finální celé CI, merge, nasazení a živé výsledky budou doplněny do popisu opravného PR. R24 zůstává IN_PROGRESS.
