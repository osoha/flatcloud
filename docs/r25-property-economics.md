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

## R25-C: vazba rozpočtu na náklad, realizaci a podklady

Z detailu nákladu lze přiřadit jednu rozpočtovou položku stejného objektu, typu OPEX/CAPEX a kategorie. Samostatný formulář vyžaduje důvod, potvrzení a aktuální verzi nákladu. Přiřazení, přeřazení i zrušení vazby mají atomický audit; náklad, jeho částka, účetní kontrola, alokace a dokumenty se samotnou změnou vazby nemění. Historie je čitelná v nákladu i původní/cílové rozpočtové položce, včetně zrušené vazby. Nemění se oprávnění EDIT/ADMIN/globální správy; VIEW čte. Jednotkový přístup nerozšiřuje přístup na rozpočet domu.

Detail rozpočtu zobrazuje přiřazené náklady a jejich aktuální stav, částku, dostupnost faktury/podkladů a odkaz na související úkol. Dokumenty respektují stávající documentAccessWhere; skrytý nebo odstraněný dokument se nepočítá. Nabídka není označena jako faktura. Čerpání položky zahrnuje jen přiřazené náklady; souhrn kategorie nadále zahrnuje všechny náklady i bez vazby.

- PLANNED → COMMITTED → ACTUAL se provádí změnou stejného nákladu. Přílohy ani alokace nejsou další náklady. Zbývá = aktuální limit − objednáno − skutečnost; plán zbytek nečerpá. Evidence skutečnosti neznamená úhradu.
- Náklad může zůstat navázaný i při přesunu do jiného roku. Detail jej výslovně označí „Mimo rok rozpočtu“ a neodečte ho z limitu daného roku; historie realizace se neztrácí. Roční souhrn používá rok data nákladu jako dosud.
- Při navázaném nákladu nelze obecnou editací změnit typ/kategorii v rozporu s položkou; nejprve je nutná explicitní změna vazby.
- Staré i nové řízené CAPEX realizace se čtou přes existující UnitConditionPlanExecution. Neprovádí se domýšlení vazeb, kopírování nákladů, backfill ani zásah do řízeného CAPEX workflow. Jeho položku nelze ručně přiřadit jinému nákladu ani odpojit.
- Aditivní migrace 20260914130000_property_cost_budget_link přidává nullable budgetLineId, index a FK ON DELETE RESTRICT. Existující data zůstávají bez ručně odvozených vazeb. Návrat k předchozímu kódu může pole ponechat; žádné mazání není nutné.

Regrese `e2e/zzz-r25-budget-cost-links.spec.ts`: skutečný UI formulář, celý lifecycle jednoho ID, haléře, podklady a alokace, nezdvojené souhrny, přesun roku, přeřazení a odpojení s historií na obou položkách, VIEW a jednotkový scope, cizí rozpočet, nesoulad klasifikace, souběh a řízená CAPEX vazba. Konečné CI, merge, deploy a samostatně označené živé ověření se evidují v PR bloku. Produkční pilot zůstává budoucím samostatným krokem.

## R25-D: detail úvěru a chronologie potvrzených stavů

Finance → název úvěru zpřístupňuje datovaný potvrzený stav, původní a zbývající jistinu, samostatnou měsíční dluhovou službu, fixaci a splatnost včetně prošlých termínů. Historie zachovává všechny záznamy, poznámku/zdroj, čas zápisu a autora doloženého auditem; chybějící autor se nevymýšlí. Budoucí historické plány nevstupují do aktuálního stavu. Bez datovaného podkladu detail výslovně uvádí „Nedoloženo“.

Roční úrok se čte ze stávající samostatné roční evidence s účetním stavem a odkazem na roční podklady. Splátka ani rozdíl zůstatků nejsou prohlášeny za zaplacený nebo daňově uznatelný úrok. Oprávnění odpovídá financím celého objektu; jednotkové ani cizí oprávnění detail nezpřístupní. Historie není omezena aktivitou úvěru/nemovitosti.

Zápis zpětně datovaného stavu již nepřepisuje aktuální cache starší hodnotou: vybírá poslední nebudoucí stav. Zápis snapshotu, souhrnu a auditu je jedna serializovatelná transakce. Žádná migrace, mazání ani změna účetních/platebních záznamů.

Regrese: nesetříděná chronologie a budoucí záznam, zpětný zápis přes skutečné API s ověřením cache/auditu, čitelný detail, VIEW bez zápisu a cizí vlastník 404. Lokální pure test a TypeScript; kompletní CI a živá kontrola budou samostatně doloženy v PR. Stav před CI: neuzavřeno.
