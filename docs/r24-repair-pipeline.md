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
| H | Sdílené OAuth a sandboxová složka schváleny 2026-09-09. Ochrana implementována pro samostatné PR/CI; živá konfigurace a testy zůstávají otevřené. Postup v [bránách B/H](r24-storage-and-visibility-gates.md). |

Neúspěšné běhy zůstávají v historii: A a C zpřesnily selektory a testovací session transport; G doplnil nové povinné potvrzení do původního ročního scénáře; D změnil očekávání účetního formátu. Žádný test nebyl přeskočen ani odstraněn kvůli selhání. Před merge musí být zelené celé CI na posledním SHA.

Další priorita: B (politika historie a interních poznámek) → H (izolovaný storage a živý gate) → zbývající živé role/revize/vlastnictví/postprodejní návaznosti → širší obchodní TEST výběry a 200% zoom. Podrobná evidence, omezení a testovací ID jsou v [auditu](audits/r24-agent-audit-2026-09-08.md).
