# P02 — týmové úkoly, oznámení a automatická pravidla

## Rozsah

P02 přidává obecná týmová vlákna bez povinné vazby na nemovitost, cílená oznámení a centrálně řízený katalog automatických úkolů. Nemění finanční výpočty, stav smlouvy ani existující úkoly navázané na objekt.

## Týmová vlákna

- obecný úkol může založit `SUPER_ADMIN` nebo `MANAGER`;
- role ve vlákně jsou odpovědný, spoluřešitel a sledující;
- tvůrce, odpovědný a spoluřešitel mohou zapisovat, sledující pouze čte;
- přílohy obecných vláken používají `TaskAttachment` a soukromé úložiště `99_Interní/Týmové úkoly`; přílohy objektových úkolů zůstávají v evidenci dokumentů nemovitosti;
- oblíbenost, skrytí z dashboardu a poslední přečtení jsou osobní stav `TaskUserState` a nemění společný stav úkolu;
- otevření přílohy vždy znovu ověřuje přístup k úkolu.

## Oznámení

Oznámení vytváří pouze super-admin. Publikum lze skládat z příjemců `ALL_USERS`, `FLATCLOUD_MEMBERS`, role, nemovitosti a konkrétního uživatele. Platnost určuje `startsAt`, volitelný `expiresAt` a ruční `active`. Uživatelovo skrytí je vratný osobní stav; oznámení nemaže ani neukončuje.

## Automatické úkoly

Výsledný stav pravidla je:

`globalEnabled && (lokálně ENABLED || (lokálně INHERIT && defaultEnabled))`

Globální vypnutí má tedy bezpečnostní přednost. Lokální správce s oprávněním `EDIT` může pouze dědit, zapnout nebo vypnout pravidlo pro svůj objekt. První aktivní spouštěče jsou:

- blížící se konec nájmu;
- výročí nájmu / kontrola indexace;
- evidované ukončení nájmu a převzetí bytu.

Katalog dále obsahuje vypnuté položky pro převzetí objektu, splatnost nákladu, nespárovaný bankovní pohyb, revize a rozhodné termíny dodavatelských smluv. Ty nelze globálně zapnout, dokud nebude hotový jejich autoritativní datový zdroj.

Plánovač běží hodinově. Nevytváří historický backfill a používá unikátní `dedupeKey` ve tvaru `automation:<rule>:<lease>:<event-date>`. Opakovaný i souběžný běh je idempotentní.

## Release a návrat

Migrace pouze přidává nové tabulky a vazby a mění `Task.propertyId` na volitelné. Existující úkoly zůstávají objektové. Před produkčním převzetím se provede samostatný checkpoint P01B + P07A + P02, ověření plánovače a kontrola nově vzniklých úkolů. Vypnutí pravidel zastaví nové instance; již vytvořené úkoly se automaticky nemažou.
