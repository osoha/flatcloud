# R26C1 – historie odečtů jednotky

16. 9. 2026. Výchozí sandbox HEAD `361b7785650efcf5fe227c88f3b7104754b76bd5`, remote osoha/flatcloud, čistý strom, AGENTS.md ověřen. Cílem výhradně sandbox/ux-agent.

## Rozsah

Rozšíření stávajících Meter/MeterReading, nikoli druhá evidence. Osobní/dálkový odečet a explicitní odhad; odhad vyžaduje zdůvodnění. Nové záznamy obsahují autora a měrnou jednotku. Staré záznamy mají LEGACY/nezjištěný způsob i autora, současná měrná jednotka měřidla je při migraci převzata; historickou správnost této jednotky nelze zpětně prokázat.

Oprava je nový záznam s jedinečnou vazbou na předchůdce a povinným důvodem. Nemění datum ani smluvní vazbu. Starší verze zůstává viditelná; nelze z ní založit druhou větev opravy. Serializable transakce + unique omezení chrání souběžné opravy. Stejný den nelze nově zadat dvakrát. Pokles stavu vůči sousedním platným odečtům se odmítá; výměna není záporná spotřeba. Opravy data/storno a hromadné přesuny chybných odečtů vyžadují další workflow.

Fotografie nebo PDF se nahraje stávající cestou do dokumentů jednotky/smlouvy a vybere u odečtu. Uloží se vazba a snapshot identifikace originálu včetně SHA. Žádná nová cesta do úložiště. Cizí jednotka, nedostupný dokument a nesprávný formát se odmítají. Oprava standardně zachová důkaz; nový lze výslovně vybrat. Archivovaná nebo nepřístupná příloha se v historii neodhaluje. Příloha není povinná pro všechny odečty.

Náhled vyúčtování zachovává vyřazená měřidla, použije poslední opravy a nepředstírá přesnou spotřebu při chybějících hraničních datech, záporném rozdílu, nejednoznačných starých duplicitách či rozdílné jednotce. Metoda odečtu se zobrazuje i ukládá do nových snapshotů protokolu. Staré protokoly zůstávají neměnné. Neprovádí se odhad ani výpočet nákladu z odečtů.

## Migrace a provozní dopad

Pouze přidané sloupce a vztahy, bez smazání záznamů; doplnění jednotky ze stávajícího měřidla. DB trigger zakazuje UPDATE/DELETE MeterReading; nevratné mazání ani reset historie není součástí úkolu. Starý servisní skript reset-test-tenants, který mění leaseId odečtů, se pro záznamy s odečty úmyslně stává nepoužitelným; nebyl spuštěn. Identitu měřidla (výrobní číslo/jednotku) nelze přes existující endpoint měnit po evidenci odečtů. Archivované nemovitosti odmítají nové zápisy, zůstávají čitelné. Stávající endpointy nadále vyžadují správu domu.

## Kontroly

- Čistá regrese oprav, chronologie, duplicit, kalendářních chyb, chybějících hranic a záporného rozdílu.
- Izolovaná DB: autor/jednotka/důkaz, nepovolaný čtenář/zapisovatel a cizí příloha, dvě souběžné opravy, DB neměnnost, vyřazené měřidlo v náhledu, zákaz zápisu do archivu; žádné předpisy.
- Browser: odhad s PDF vazbou, oprava na dálkový odečet, starý stav zachován, vyřazení měřidla bez ztráty historie.
- Lokální TypeScript a Prisma validate, kompletní CI a finální živý audit budou doloženy v PR. Lokální databáze není k dispozici; migrace se ověřuje v izolované CI před mergem.

## Další bloky

R26C2: domovní hlavní/podružná měřidla, hierarchie, umístění, období osazení a návaznost výměn. R26D2: klíče služby, osoby/plochy v čase a rozdíl hlavní/podružná voda. R26E: úhrady a uzávěrka. R26F: schválení/verze/PDF/vypořádání. Automatické úkoly až po vyúčtování dle záznamu v auditu R26D1. Žádný vlastní algoritmus tepla, žádné reálné platby nebo e-maily.
