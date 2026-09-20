# Vizuální polish — odložený backlog

## Lidské review Flatberry po R31 — 20. 9. 2026 (pouze evidence)

Tyto připomínky nyní NEIMPLEMENTOVAT. Uživatel bude přidávat další a následně spustí samostatný blok grafiky a UX. Funkční administrátorská pipeline pokračuje odděleně.

- **FB-01 — Avatar objektu:** kresba je po R31 příliš velká. Mírně ji zmenšit; cílem není návrat k původní téměř prázdné dlaždici. Velikost znovu posoudit podle screenshotu `b178be4c-570c-4f66-847e-3bd14873cd27.png`. H1 tímto požadavkem neměnit.
- **FB-02 — Bubliny v reportech:** přehodnotit zejména „LIVE · Data k …“ a „Provozní KPI · napříč vlastníky“ pod H1. Navrhnout zjednodušení, přesun či odstranění podle informačního významu, ne pouze další změnu barvy. Reference `950857ee-35e5-46cd-88b1-75ef1ff0bc29.png`.
- **FB-03 — Nefunkční výzvy k akci:** projít celou aplikaci a doplnit skutečné prolinkování textů typu „Otevřete nastavení“. Konkrétně Administrace: Bankovní schránka a Odesílání e-mailů. Odkaz musí vést přímo k odpovídajícímu nastavení a fungovat i z klávesnice. Reference `97f67fde-5c3c-4f50-a7e3-d4254a0965a9.png`. I tato položka je na výslovný pokyn zatím jen evidovaná.

Tento backlog se otevře až po dokončení funkční opravné pipeline. Nálezy zde nejsou důvodem k průběžnému přestavování funkčních bloků; projdou samostatnou agentní kontrolou v roli grafického designera a následným lidským review.

## VP-01 — Filtry Dokumentů

- Zdroj: lidské review sandboxu, 6. 9. 2026.
- Stránka: Dokumenty.
- Nález: filtrovací karta má na desktopu nepřiměřenou výšku a velkou prázdnou plochu; pole „Datum dokumentu do“ přepadá do druhého řádku, zatímco první řádek nevyužívá dostupnou šířku konzistentně.
- Očekávání pro designerskou vlnu: sjednotit grid, šířky ovládacích prvků, vertikální rytmus a responsivní zalamování s ostatními filtračními panely. Zachovat logické pořadí a přístupné popisky obou dat.
- Stav: opraveno v R11A; široký desktop, střední šířka i mobil mají explicitní grid bez náhodného zalomení.

## VP-02 — Kotvy detailu jednotky

- Zdroj: designerská cloudová kontrola scénářové jednotky, 6. 9. 2026.
- Stránka: Detail jednotky.
- Nález: při přímém otevření `#kvalita`, `#komunikace` nebo `#dokumenty` překryla sticky navigace začátek cílové sekce.
- Stav: opraveno v R11A doplněním jednotného scroll offsetu pro všechny položky lokální navigace.

## VP-03 — Husté provozní tabulky

- Zdroj: designerská cloudová kontrola Kvality, Distribuce a reportu Smluv, 6. 9. 2026.
- Nález: osm a více sloupců se na běžném notebookovém viewportu smrštilo tak, že se názvy objektů, stavy a akce lámaly po několika znacích.
- Stav: opraveno v R11B; husté tabulky mají čitelnou minimální šířku a zůstávají uvnitř existujícího horizontálně posuvného kontejneru.

## VP-04 — Mezera po skrytém sidebaru

- Zdroj: CSS průřez responzivních breakpointů, 6. 9. 2026.
- Nález: mezi 701 a 900 px se sidebar transformací skryl, ale pozdější pravidlo ponechalo hlavnímu obsahu odsazení 196 px.
- Stav: opraveno v R11B; kompaktní shell v celém rozsahu do 900 px používá plnou šířku hlavního obsahu.

## VP-05 — Prázdné stavy a mobilní akce

- Zdroj: průřez globální kaskádou stylů a vstupními formuláři, 6. 9. 2026.
- Nález: pozdější obecné pravidlo zmenšovalo všechny prázdné stavy na parametry kompaktního widgetu; mobilní pravidla současně skrývala sekundární titulkové akce a odebírala text primárním tlačítkům bez ikony.
- Stav: opraveno v R11C; plnostránkové a kompaktní prázdné stavy mají explicitně oddělenou hierarchii a všechny důležité titulkové akce zůstávají na mobilu viditelné a čitelné.

## VP-06 — Nepravdivý popis formátu reportu

- Zdroj: cloudová kontrola skutečného kvartálního náhledu, 6. 9. 2026.
- Nález: aktivní šablona i renderer správně používaly zdrojový poměr FlatCloud 13:9, ale karta editoru stále výstup popisovala jako A4 na šířku.
- Stav: opraveno v R11D; editor používá neutrální popis a samotný náhled zobrazuje konkrétní formát aktivní šablony i správnou cestu pro tiskovou kontrolu.
