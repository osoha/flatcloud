# R24 – agentní audit FlatCloud

- Datum zahájení: 8. 9. 2026
- Prostředí: `sandbox/ux-agent` + izolovaná CI databáze
- Datový marker: `R24_AGENT_QA_2026_09`
- Stav: `IN_PROGRESS`
- Produkce / `main`: beze změny

## Pokrytí

| Oblast | Automatizovaná role QA | Cloud browser | Odborný audit |
|---|---:|---:|---:|
| Scope a oprávnění | připraveno | čeká na obnovení zabezpečené relace | bezpečnostní optika připravena |
| Nájemní lifecycle | existující smoke + R24 role | čeká | produktová/právní matice připravena |
| Technická správa | R24 technický správce | čeká | benchmark připraven |
| Distribuce a postprodejní péče | R24 šéf distribuce | čeká | benchmark připraven |
| Asset a výroční reporting | R24 asset manager | čeká | benchmark připraven |
| Vizuální konzistence | základní DOM/overflow gate | čeká | optika připravena |
| Dokumenty a úložiště | kontraktové testy existují | čeká | simulace navržena |
| Právní dokumenty | negativní scénáře navrženy | neúčinné kroky pouze do preview | rešerše dokončena |

## Potvrzené nálezy

Nálezy se doplní pouze z reprodukovatelného browserového nebo kontraktového důkazu.

| ID | Závažnost | Role | Lifecycle | Stav | Shrnutí |
|---|---|---|---|---|---|
| — | — | — | — | — | Žádný nález zatím nebyl uzavřen bez živého důkazu. |

## Registr nálezu

Každý nový záznam musí obsahovat:

- `persona`, `lifecycle`, `severity`, `status`,
- `url`, `testData`, `steps`,
- `expected`, `actual`, `evidence`,
- `scope`, `reproducibility`, `recommendation`, `acceptanceTest`.

## Omezení průchodu

Cloudová relace sandboxu vypršela před zahájením R24. Přihlašovací údaje se nesmějí číst ani vkládat automatizací; živý role-based průchod proto čeká na bezpečné obnovení přihlášení. Toto omezení neblokuje návrh matice, CI identity, izolované browser testy, tržní benchmark ani právní rešerši.

## Kandidáti do následné pipeline

Do této části se přesunou pouze potvrzené nálezy. Priorita se určí podle dopadu, pravděpodobnosti, rozsahu dat a existence bezpečného workaroundu.
