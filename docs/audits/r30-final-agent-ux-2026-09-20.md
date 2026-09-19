# R30 — finální agentní UX průchod sandboxu

Datum auditu: 20. 9. 2026  
Rozsah: pouze `sandbox/ux-agent`, bez zásahu do `main` a produkčního Renderu.

## Cíl

Po R28/R29 projít aplikaci jako celek, nikoli po izolovaných opravách. Finální gate kombinuje optiku seniorního web designera, asset managera, externího vlastníka a mobilního uživatele. Automatizovaný důkaz je v `e2e/r30-final-agent-ux.spec.ts`; merge je dovolen pouze po kompletním CI a browser smoke.

## Co je nyní součástí finálního základu

- R28: čistší tab navigation, kontextově sbalitelné Provoz/Finance, mrtvé děliče odstraněné ze sbaleného railu, wide-desktop ochrana proti zbytečnému horizontálnímu scrollu, vizuální design-system audit.
- R29A: historické pohledávky a viewport-safe velké popupy.
- R29B: editace uživatelů s úrovněmi Čtení / Zápis / Plná správa, odděleným rozsahem objektů a jednotek a last-admin ochranou.
- R29C: jednotkový reporting/context, ochrana reportových korekcí a zachování kontextu Podkladů vyúčtování.
- R29D: kompaktnější Náklady a úvěry / Platby a přesun Bezpečnosti dat z velké karty do drobného disclaimeru.

## Automatizovaný průchod R30

### Senior web designer — desktop 1440 × 900

Prochází Portfolio, všechny hlavní pohledy Reportů, Úkoly, Revize, Kvalitu/CAPEX, finanční registry, Nájemníky, Smlouvy, Dokumenty, Vlastníky, Distribuci, všechny části Metodiky, Akcionářské reporty, Uživatele a Administraci. Na každé ploše kontroluje:

- žádný HTTP 4xx/5xx v očekávané dostupné agendě,
- žádný `pageerror`, `console.error` ani HTTP 5xx během práce,
- existenci hlavního obsahu a nadpisu,
- globální horizontální overflow maximálně 2 px,
- žádný samovolně otevřený modal.

### Asset manager — celý kontext nemovitosti

Prochází všechny property tabs: Přehled, Jednotky, Nájemníci, Smlouvy, Platby, Náklady a úvěry, Podklady vyúčtování, Provoz, Banka a pravidla, Měřidla, Technické údaje, Dokumenty, Reporty a Nastavení. Navíc hlídá:

- viditelnou property tab navigation,
- právě jednu aktivní záložku,
- nulový globální overflow,
- tab row bez horizontálního scrollu na širokém desktopu.

### Mobilní critical path — 390 × 844

Kontroluje Portfolio, Reporty a klíčové části nemovitosti: Přehled, Náklady a úvěry, Platby a Nastavení. Globální obsah se nesmí roztahovat mimo viewport; lokální tabulky/tab navigation mohou bezpečně scrollovat tam, kde je to nutné.

### Externí vlastník

Kontroluje Portfolio a Reporty v read-only scope a nepřítomnost vstupů do Uživatelů, Administrace a Distribuce. Tím se zároveň ověřuje, že vizuální zjednodušení sidebaru nezpřístupnilo interní administrativní chrome.

## Výsledek kombinovaného design / asset-management review

### Bezprostředně uzavřené oblasti

| Oblast | Stav | Poznámka |
| --- | --- | --- |
| Tab navigation | READY | Po R28 bez inward hooku; široký desktop bez zbytečného scrollbar efektu. |
| Sidebar | READY | Přehled trvale otevřený; Provoz/Finance kontextové; minimized rail bez mrtvých toggle/dělících prvků. |
| Velké popupy | READY | Viewport-safe shell a živé regresní scénáře z R29A. |
| Uživatelé / oprávnění | READY | Čtení/Zápis/Plná správa a scope objekt/jednotka jsou explicitní. |
| Jednotkový reporting | READY | Reporty a Podklady drží správný scope; interní korekce jsou oddělené. |
| Náklady a platby | READY | Kompaktnější informační hierarchie, bezpečnostní sdělení je sekundární disclaimer. |

### Zbývající design-system doporučení — nejsou release blocker

1. **Reporty — header consolidation.** `LIVE · Data k …`, `Provozní KPI · napříč vlastníky` a `Provozní rozsah správy` stále představují tři vrstvy stejného kontextu. R28 návrh zůstává platný: datum + režim + scope sloučit do jedné metadata vrstvy, dlouhou notice kartu nahradit jednořádkovým vysvětlením rozdílu provozní vs. konsolidovaný pohled. Toto je další samostatný vizuální blok, ne skrytá oprava uvnitř R30.
2. **Kvartální/výroční report editor.** Funkčně je workspace stabilní, ale pracovní chrome má stále výraznější vlastní vizuální jazyk než core aplikace. Doporučení: pattern C z R28 — jednodušší pracovní header, velký hero ponechat primárně pro preview/export.
3. **Administrace.** Funkce jsou seskupené správně, ale některé sekce mají stále příliš podobnou vizuální váhu. Další design pass může snížit počet konkurenčních card surfaces bez změny funkcí.
4. **Typografické sjednocení.** R28 standard je definovaný; další plošná implementace má být samostatná, aby nemíchala kosmetiku s právě uzavřenými funkčními bloky.

## Release decision pro sandbox

R30 je acceptance/audit gate. Nezavádí novou business logiku a záměrně neimplementuje další široký redesign dřív, než bude možné porovnat R28 grafické návrhy jako celek. Pokud celý CI + browser smoke projde zeleně, aktuální sandboxový základ je z pohledu této pipeline připraven pro lidskou vizuální kontrolu a další cílené design-system bloky.
