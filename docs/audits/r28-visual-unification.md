# R28 — vizuální audit a sjednocení FlatCloud

## Cíl
Sjednotit horní část obrazovek, typografii, rozestupy a informační hierarchii bez změny business logiky. Referenční vzor je detail jednotky / nemovitosti: jasná identita, primární akce, minimum sekundárních sdělení a tab navigation bez vizuálního šumu.

## Dvě optiky auditu

### Senior web designer
1. Konzistence page headeru: breadcrumb → H1 → jediný kontextový subline → akce → tabs.
2. Jednotná typografická škála, vertikální rytmus a šířky karet.
3. Odstranění duplicitních statusových badge a notice karet, pokud opakují kontext.
4. Desktop 1440–1920 px bez horizontálního scrollu tam, kde se obsah může bezpečně zkomprimovat; scroll zůstává u skutečně širokých dat.
5. Mobile/zoom zachová scroll tam, kde je nutný.
6. Tab navigation: bez inward hooku, čistá horní hrana, jemně zakulacený pouze spodní vnější roh.
7. Stavové barvy používat pouze pro rozhodnutí, chybu, riziko nebo potvrzený stav; ne pro dekorativní metadata.

### Asset manager
Každý badge/callout musí odpovědět na otázku: mění interpretaci KPI nebo rozhodnutí uživatele?
- Pokud ano a je stavový: integrovat do page headeru / scope pickeru / titulku KPI.
- Pokud ano, ale jde o metodické vysvětlení: kompaktní info/help affordance, ne velká permanentní karta.
- Pokud pouze opakuje již viditelný scope nebo datum: odstranit.
- Warning/blocker/action-required zůstává vizuálně výrazný.
- Kontext vlastnictví a konsolidace musí zůstat dohledatelný, ale nesmí soutěžit s hlavními KPI.

## Tři cílové header patterns

### A — Identity header
Použít pro nemovitost, jednotku, nájemníka a smlouvu.

```text
breadcrumb
┌ icon / typ ── Název entity ───────────── primární akce ┐
│ ID / adresa     2–3 kompaktní metadata     stav / KPI   │
└──────────────────────────────────────────────────────────┘
╱ Přehled │ Finance │ Smlouvy │ Dokumenty │ … ╲
```

Pravidla: tabs navazují přímo na identity card, žádná obecná informační karta mezi headerem a navigací, maximálně jeden skutečně důležitý warning.

### B — Category header
Použít pro Portfolio, Reporty, Úkoly, Revize, Kvalitu/CAPEX, Distribuci, Metodiku, Uživatelé a Administraci.

```text
Název stránky                       scope / hlavní akce
jedna věta kontextu · subtilní metadata
──────────────────────────────────────────────────────
╱ tab 1 │ tab 2 │ tab 3 │ … ╲
```

Pravidla: datum dat, scope a režim patří do jediné metadata vrstvy. Nevkládat velkou notice kartu jen kvůli vysvětlení stránky.

### C — Workspace / editor
Použít pro kvartální a výroční report editor a podobné dlouhé workflow.

```text
breadcrumb
Název workflow · období / revize                stav + akce
krátký pracovní kontext
[levá/vrchní navigace kapitol]  [editor]
```

Velký prezentační hero je vhodný až v náhledu/exportu reportu, nikoli jako standardní pracovní chrome aplikace.

## Typografický a spacing standard
- H1 aplikace: 24–27 px, line-height 1.15, jedna konzistentní váha.
- H2 karty: 14–16 px; pracovní podnadpis 12–13 px.
- Kontext / subline: 11–12 px; metadata 9–10 px.
- Tab label desktop: cílově 10–12 px podle počtu položek; nikdy nesnižovat pod čitelnost jen proto, aby se vešel špatně navržený počet tabů.
- KPI hodnota: 18–22 px; label 10–11 px.
- Table header: 9–10 px; body 11–12 px.
- Standardní mezera mezi hlavními bloky: 16–18 px. Header → tabs: 0–12 px podle patternu. Tabs → obsah: 18 px.
- Vnitřní padding běžné karty: 18–20 px; kompaktní metadata / toolbar 10–14 px.

## KEEP / MERGE / REMOVE pravidla pro bubliny

| Typ prvku | Rozhodnutí | Cílové řešení |
| --- | --- | --- |
| Action-required, blocker, chyba, právní riziko | KEEP | Výrazný inline warning nebo karta přímo u dotčené akce |
| Úspěch po uložení / jednorázový flash | KEEP | Krátký flash, po navigaci zmizí |
| LIVE datum dat | MERGE | Subtilní metadata u H1 nebo report period control |
| Scope portfolia / vlastník / výběr objektů | MERGE | Jeden scope picker + krátký textový popis |
| „Provozní KPI napříč vlastníky“ | MERGE | Ne jako samostatný badge; scope/režim v metadata vrstvě |
| „Provozní rozsah správy“ dlouhá vysvětlovací karta | REMOVE jako karta | Krátký disclaimer/help u scope pickeru |
| Metodické vysvětlení běžné funkce | MERGE | `i`/help text nebo kompaktní helper pod nadpisem |
| Stavové pill v tabulce | KEEP | Pouze pro reálný stav / readiness / ověření |
| Dekorativní pill bez rozhodovací hodnoty | REMOVE | Prostý text / metadata |
| Data quality souhrn | KEEP, ale compact | Sbalená pracovní fronta; explicitní počet problémů, rozbalit na vyžádání |

## Systematický průchod obrazovek

| Oblast | Pattern | Audit z pohledu designu | Asset-manager rozhodnutí | Návrh před → po |
| --- | --- | --- | --- | --- |
| Portfolio | B | Header je již relativně čistý; scope picker napravo funguje. KPI + „Vyžaduje pozornost“ mají dobrou hierarchii. | KEEP scope, KPI a action queue. | Zachovat strukturu; srovnat font/spacing s Reporty a dalšími category pages. |
| Reporty – všechny tabs | B | Horní část je přetížená dvěma badge a další notice kartou; tabs jsou správný hlavní navigační prvek. | MERGE LIVE datum + provozní režim; REMOVE velkou kartu Provozní rozsah správy. | H1 + scope + 1 metadata řádek → tabs → KPI. |
| FlatCloud Asset | B | Musí vizuálně působit jako režim stejného Report Center, ne jako jiná aplikace. | KEEP jasné označení konsolidovaných aktiv, ale v metadata vrstvě. | Scope text „FlatCloud Asset · potvrzená aktiva“ u headeru, bez dalšího badge stacku. |
| Valorizace | B / workspace uvnitř | Hodně ovládacích prvků; header nesmí přidávat další vertikální vrstvy. | KEEP scénář, horizont a stav uloženého plánu; metodiku compact. | Report header jednotný, vlastní forecast toolbar až pod tabs. |
| Nemovitost – všechny tabs | A | Současný `property-header` je referenční. Meta pills jsou užitečné, ale počet držet nízký. | KEEP vlastník, počet jednotek a bankovní coverage; dluh jako rozhodovací KPI. | Identity card → přilepené tabs; žádné další intro callouty. |
| Jednotka | A | `unit-hero` je druhý referenční vzor. Tabs a mini KPI jsou čitelné. | KEEP obsazenost, vlastník, účet, nájemník, předpis, dluh. | Přiblížit tabs k hero stejně jako u nemovitosti; sjednotit radius/spacing. |
| Nájemník – seznam | B | Seznamová agenda má být category page, nikoli profilový hero. | KEEP filtry/rozsah a stavy. | Stejný header jako Úkoly/Revize. |
| Nájemník – detail | A | Profil má být vizuálně stejná rodina jako jednotka a smlouva. | KEEP kontaktní identitu + aktivní vztahy; historické dluhy odděleně. | Identity card + klíčové vztahy; odstranit obecné intro notice. |
| Smlouva – seznam | B | Category agenda. | KEEP expirace/indexace pouze jako action state. | Jednotný category header + filtr + tabulka. |
| Smlouva – detail | A | Klíčový je nájemník, jednotka, trvání, finance. | KEEP rent/services/kauce/dluh; právní warningy. | Identity header smlouvy + KPI; méně samostatných vysvětlujících karet. |
| Předpisy / Saldo / Kauce | B | Tři finanční agendy používají podobné tabulky, ale liší se hustotou. | KEEP period/scope a finanční statusy. | Sjednotit toolbar, table density a spacing; žádné dekorativní notice. |
| Náklady a platby | A uvnitř nemovitosti | Aktuálně příliš mnoho vertikálních vysvětlení; tabulky mohou být kompaktnější. | MERGE „Bezpečnost dat“ do drobného disclaimeru u importu/akce. | Header/tab kontext → KPI → obsah; velká bezpečnostní karta pryč. |
| Úkoly | B | Dobrá kandidátní reference pro pracovní seznam. | KEEP počty urgent/overdue a filtry; ne další obecné info boxy. | Jednotný header + scope + action. |
| Kvalita a CAPEX | B | Hlavní problém jsou velké dialogy a různorodé snapshot cards. Viewport-safe modal je správný směr. | KEEP readiness/action states; metodický popis compact. | Category header + KPI/status → seznam; modal pouze pro edit/detail. |
| Revize | B | Scope + pracovní fronta. | KEEP po termínu / do 60 dní; odstranit obecné vysvětlení, pokud jen opakuje název. | Stejná hlavička jako Úkoly. |
| Distribuce / CRM | B / workspace | Grafika se nesmí odtrhnout od core aplikace; edit dialogy musí mít stejný modal shell. | KEEP readiness, valuaci, opce, stav zájemce. | Jednotný header; interní tabs; jeden modal design. |
| Metodika / Průvodci / Média | B | Obsahově jiný modul, ale chrome má zůstat stejný. | KEEP audience/progress jen pokud vede k akci. | Category header + tabs; kartičky obsahu až pod nimi. |
| Akcionářské reporty – index | B | Index reportů má působit jako agenda. | KEEP období, stav koncept/kontrola/publikováno. | Category header + kompaktní statusy. |
| Kvartální / výroční editor | C | Současné hero/editorská navigace mají vlastní vizuální jazyk; zmenšit rozdíl proti aplikaci. | KEEP stav workflow, completeness, blocker. | App workspace header; velký vizuální hero jen v preview/PDF. |
| Uživatelé | B | Po R29B je permission editor věcně jasnější; horní chrome sjednotit. | KEEP role a rozsah, ale role ≠ permission level. | Category header + seznam; detail/edit v jednotném card/workspace patternu. |
| Administrace | B | Admin cockpit má tendenci k příliš mnoha boxům stejné váhy. | KEEP pouze readiness/error stavy. | Category header + seskupené sekce, méně konkurenčních calloutů. |
| Vyúčtování / Podklady | A uvnitř nemovitosti | Kontext musí vždy jasně říct objekt/jednotku/smlouvu. | KEEP completeness a missing evidence; metodické copy compact. | Property/unit context → tabs → pracovní stav → data. |

## Detailní rozhodnutí: Reporty
Současné `LIVE · Data k …`, `Provozní KPI · napříč vlastníky` a velká karta `Provozní rozsah správy` sdělují překrývající se kontext.

Cílový header:
```text
Reporty                                      [ Vše ve správě ▾ ]
Vše ve správě · data k 19. 9. 2026 · provozní pohled
ⓘ Provozní KPI zahrnují svěřené objekty napříč vlastníky; nejde o konsolidované KPI FlatCloud.
────────────────────────────────────────────────────────────
╱ Přehled │ FlatCloud Asset │ Valorizace │ Obsazenost │ … ╲
```

- datum dat ponechat jako subtilní metadata u H1;
- scope `Vše ve správě / vlastník / vybrané objekty` zobrazit v jednom scope controlu;
- `Provozní KPI · napříč vlastníky` nepoužívat jako samostatný badge, pokud stejný scope plyne z pickeru;
- dlouhou kartu `Provozní rozsah správy` odstranit z běžného stavu;
- vysvětlení rozdílu provozní vs. konsolidovaný pohled dát do jednořádkového inline disclaimeru / tooltipu;
- ve `FlatCloud Asset` změnit metadata na `Konsolidovaný pohled · potvrzená aktiva`.

## Karta nemovitosti / jednotky
Považovat za referenční layout: identita + primární akce + tabs. Nepřidávat mezi header a tabs další dekorativní informační karty. U jednotky přiblížit tab row přímo k hero card, aby oba detailní patterns působily jako jedna rodina.

## Sidebar
- Přehled je trvale otevřený.
- Provoz a Finance jsou sbalitelné.
- Bez aktivní události jsou po čistém načtení sbalené; pokud skupina obsahuje aktivní notifikaci, otevře se automaticky. Aktivní route ji vždy otevře.
- V minimalizovaném railu se názvy skupin ani jejich toggle nezobrazují. Zůstane pouze vertikální mezera mezi skupinami; žádný mrtvý klikací dělič. Ikony mají tooltip.

## Horizontální scrollbar
Na širokém desktopu nesmí vznikat kvůli několika pixelům paddingu. Reportové tabulky při >=1450 px používají kompaktnější padding a fixed layout. Na menším viewportu se zachová bezpečný horizontální scroll.

Neznamená to plošně zakázat horizontální scroll: široké tenancy, valorizace, účetní a editorské tabulky mohou mít skutečně více sloupců než se bezpečně vejde. Rozhodovací pravidlo je: pokud se tabulka vejde po zmenšení paddingu bez ztráty čitelnosti, scroll odstranit; pokud ne, ponechat ho a zajistit viditelnou/ovladatelnou scroll oblast.

## Pořadí implementace po R28
1. Report header cleanup podle návrhu výše.
2. Unit hero/tabs alignment s property headerem.
3. Sdílený CategoryHeader primitive pro Portfolio/Úkoly/Revize/Kvalita/Distribuce/Metodika/Uživatelé/Admin.
4. Sdílený EntityHeader primitive až po ověření, že pokryje property/unit/tenant/lease bez ztráty specifických KPI.
5. WorkspaceHeader pro kvartální/výroční reporty.
6. Typografický/spacing pass a overflow test 1365×768, 1440×900, 1920×1080 + mobil 390×844.

Každý další implementační krok nejprve sandbox + browser/e2e ověření; teprve potom další skupina obrazovek.
