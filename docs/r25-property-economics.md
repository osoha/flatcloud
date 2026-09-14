# R25 — ekonomika domu

Navazuje na uživatelské uzavření R24 dne 2026-09-14, doložené závěrečným dodatkem PR #102 (200% zoom, dvě živé identity, vizuálně akceptovaná mapa výročního reportu). Historické průběžné blokace R24 tím byly uzavřeny. Tři horní „+“ zůstávají neblokující UX námět.

## R25-A: rozpočet a čerpání podle kategorií

Existující evidence již obsahuje rozpočtové položky, lifecycle nákladů PLANNED/COMMITTED/ACTUAL a potvrzenou historii úvěrů. První rozšíření doplňuje čtení rozpočtu proti čerpání podle dvojice OPEX/CAPEX a kategorie. Souhrnný přebytek tak nezakryje překročení konkrétní kategorie.

- Rok má stejný význam jako ve stávajícím ročním přehledu nákladů.
- Rozpočet se sčítá z rozpočtových položek dané kategorie a typu.
- Zbývá = rozpočet − objednáno − skutečnost. Každý náklad se počítá jednou podle aktuálního stavu, nikoli z alokací.
- Pracovní plán je samostatný; nečerpá schválený limit. Nejde o předpověď konečné ceny.
- Skutečnost je evidovaný náklad, nikoli potvrzená úhrada.
- Chybějící rozpočtová položka znamená „Bez rozpočtu“ a neurčený zbytek (—), nikoli automaticky nulový schválený limit.
- Porovnání je po kategoriích, ne párování faktury s konkrétní položkou. Haléřová přesnost; stav vyjádřen textem i při překročení.
- Stávající property scope zůstává. Není změna schématu, plateb, úvěrových pravidel nebo mazání; žádné nové zápisové endpointy.

Regrese: překročení přes kladný souhrnný zbytek, OPEX/CAPEX oddělení, více rozpočtových řádků, náklad bez rozpočtu, izolace roku, lifecycle bez dvojího započtení, haléře, UI změna roku a odmítnutí cizího vlastníka. Finální testy, CI, merge/deploy a případný živý retest se evidují v PR tohoto bloku. Bez důkazu není blok READY.

## Další ucelené kroky

1. Auditované revize rozpočtu se zachováním původního limitu a zdroje schválení; před implementací upřesnit pravidla schvalování a změn.
2. Návaznost rozpočtových položek na realizaci, faktury a projekty tak, aby se rezervace a skutečnost nezapočítávaly dvakrát.
3. Úvěry: úplnost potvrzených podkladů, termíny fixace a splatnosti, rozlišení jistiny a dluhové služby; neodvozovat skutečné platby z pouhého zadání nákladu.
4. Poté valorizace/cashflow, vyúčtování, interní distribuce, metodiky a reporty podle výhledu R24. Externí distribuce a CRM partikule zůstávají posledním blokem s briefem k dopracování.

Každý implementační blok: testy → PR → celé CI → merge pouze sandbox/ux-agent → kontrola nasazení. Uživatelský souhlas s PR/merge v tomto vlákně trvá.

## R25-B: auditované revize limitu

Rozsah navazujícího bloku odsouhlasený ve vlákně: změna částky existující rozpočtové položky s povinným důvodem/podkladem a výslovným potvrzením ve formuláři. Používá stávající oprávnění EDIT/ADMIN a globální správu; nejde o nové víceúrovňové schvalování ani potvrzení úhrady. VIEW může číst detail a historii. Přístup pouze k jednotce nezpřístupňuje rozpočet celého domu. Řízené CAPEX položky zůstávají v jejich procesu.

- Finance → název rozpočtové položky → detail, aktuální a výchozí doložený limit, původní poznámka/zdroj, historie revizí.
- Výchozí doložený limit je částka před první evidovanou revizí, případně aktuální částka bez revizí. Nerekonstruuje neexistující historická data.
- Revize zachová ID, název, rok, typ, kategorii, poznámku a datum vzniku. Uloží plný snapshot před/po, autora, čas a důvod. Historie zůstává čitelná i u archivované nemovitosti podle stávajícího scope.
- Kladný limit s haléřovou přesností, nejvýše 21 474 836,47 Kč; odmítnutí zaokrouhlování, nulové/záporné hodnoty, nezměněné částky a nepotvrzeného formuláře.
- Limit a audit se zapisují v jedné serializovatelné transakci. Verze formuláře brání přepsání souběžné změny; stabilní ID požadavku a fingerprint zajišťují idempotentní opakování bez přepsání pozdější revize.
- Čerpání po kategoriích používá aktuální limit. Náklady, alokace a doklady se touto změnou neupravují. Žádná migrace ani mazání dat.

Automatické regrese `e2e/zzz-r25-budget-revisions.spec.ts`: UI a návrat do stejného roku, zachování podkladu a nákladu, aktualizace zbytku limitu, archivní historie, souběh dvou revizí, opakování původního požadavku po další revizi, neplatný vstup a následná úspěšná revize, VIEW/EDIT/cizí objekt/jednotkový přístup a řízený CAPEX. Výsledky kompletního CI a případné živé ověření se zapisují do PR; implementace sama není důkazem dokončení.
