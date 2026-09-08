# R24 – prioritizovaný návrh opravné pipeline

Podklad: [audit R24](audits/r24-agent-audit-2026-09-08.md), nálezy R24-001 až R24-012. Stav návrhu: průběžný po 14 mutačních scénářích dne 8. 9. 2026. Implementace oprav není součástí auditního PR.

Každý blok samostatně: pracovní větev ze současné `sandbox/ux-agent` → relevantní regresní testy → PR s base `sandbox/ux-agent` → kompletní CI build, migrace a browser-smoke na aktuálním SHA → kontrola diffu → merge pouze do sandboxu → živý retest. Bez úprav `main`, produkce, skutečné komunikace či plateb, publikace a nevratného mazání. Chybějící či neúspěšný důkaz blokuje merge; nesnižovat přísnost gate.

| Pořadí / blok | Priorita a nálezy | Rozsah a výsledek | Povinný důkaz před merge |
|---|---|---|---|
| A – integrita úkolu | P1, R24-010 | Explicitní reopen s důvodem; příslib nezmění terminální úkol. Atomické změny stavu a closedAt. | Databázové testy DONE/CANCELLED, souběh uzavření a příslibu, UI reopen, CAPEX gate. |
| B – viditelnost vlákna | P1, R24-002 | Rozlišení interního a vlastnického záznamu včetně příloh a bezpečné migrační strategie. | OWNER_VIEWER nesmí číst interní obsah přes UI, URL ani export; zachování scope jednotky; migrační ověření. Změna bezpečnostní hranice vyžaduje samostatné lidské rozhodnutí dle AGENTS.md před implementací. |
| C – životní cyklus nákladů | P1, R24-011 | Editace a audit Plán → Objednáno → Skutečnost na jednom ID; vazba na technický úkol. | Bez dvojího započtení, souběh změn, zachování alokací a dokladů, scope vlastníka, účetní období. |
| D – přesnost účetního detailu | P2, R24-012 | Haléřová přesnost v detailu a rozdělení nákladů. | Částka 1 234,56 Kč a tři jednotky: viditelné řádky i celkem souhlasí; beze změny výpočtu. |
| E – bezpečné výchozí hodnoty | P1, R24-005/008 | Prázdný objekt globálního úkolu; explicitní politika testovacích identit pro reportové defaulty. Testovací řešitel musí zůstat použitelný v QA. | Kontextový propertyId funguje jen pro dostupný objekt; globální submit vyžaduje volbu; testovací tým nevstoupí automaticky do reportu. Neomezovat přístupová práva rolí. |
| F – navigace a čitelnost | P1/P2, R24-001/003/007/009 | Jedna aktivní větev reportů, jeden main, mezery notice, vyhledávání nájemního vztahu. | Klávesnice, aktivní i historické vztahy, mobil, 200% zoom, reportové landmarky. |
| G – kvalita geokódu | P1, R24-006 | Viditelná míra shody a ruční potvrzení/korekce nejednoznačného bodu. | Fixture adres s různou kvalitou; bez posouvání celé mapy; chybový stav nezapisuje tichý chybný bod. |
| H – sandboxové dokumenty | P1, R24-004 | Izolovaný TEST storage, metadata/checksum a simulace selhání; následně vlastní izolovaný Drive gate. | Upload/preview/download/verze/zotavení a scope; žádný produkční účet; žádné destruktivní čištění v živém sandboxu. |
| I – dokončení R24 | P0/P1 pokrytí | Doplnit živé role, CRM duplicity/retry/souběh, revize, účinné vlastnictví a postprodejní návaznosti. | Nové behaviorální browser testy mají vlastní počet; jasně oddělit starých 58 scénářů, živé scénáře a nezměřené chování. Uvítání nejvýše DRAFT/preview, bez send. |

Nejprve A a C: oba blokují běžný provozní lifecycle. B má nejvyšší důležitost pro důvěrnost a musí mít před kódováním odsouhlasenou politiku viditelnosti starých záznamů. D lze řešit samostatně jako malou opravu čitelnosti. Ostatní bloky nenahrazují závěrečnou lidskou kontrolu a pozdější zátěžový test.
