# FlatCloud Rent V21.1 – architektura

## 1. Cíl aplikace

FlatCloud je interní property-management nástroj pro vlastníka a správce nájemních nemovitostí. UI je orientované na pracovní stav a výjimky: co vyžaduje pozornost, kdo případ řeší, do kdy a jaký je průběh.

Technologie: Next.js 16 / React 19 / TypeScript / Prisma 6 / PostgreSQL / Render.

## 2. Oprávnění

- `SUPER_ADMIN` – celé portfolio, administrace aplikace, globální nespárované e-mailové platby.
- `MANAGER` / uživatel s `allProperties` – portfolio dle rozsahu role.
- property membership `VIEW / EDIT / ADMIN` – přístup k celé nemovitosti.
- unit membership `VIEW / EDIT / ADMIN` – omezený přístup ke konkrétním jednotkám.
- `OWNER_VIEWER` může číst úkolová vlákna a stav řešení, ale bez `EDIT` je nemůže měnit.

Každý zápis přes API znovu ověřuje oprávnění a scope entity; nespoléhá pouze na skrytí tlačítka ve frontendu.

## 3. Hlavní domény

### Nemovitost a jednotky

`Property` → `Unit` → `Lease` → `Charge` → `PaymentAllocation`.

Vlastnictví je oddělené přes `PropertyOwnership` a `UnitOwnership`. Platební účet vlastníka je číselník `OwnerBankAccount`.

### Účty pro nájemné

`PropertyPaymentAccount` je explicitní vazba **nemovitost ↔ OwnerBankAccount**. Jeden účet může být použit u více nemovitostí a jedna nemovitost může mít více účtů.

`UnitOwnership.ownerBankAccountId` a `Lease.ownerBankAccountId` určují, na jaký účet platí konkrétní smlouva. Při použití účtu na jednotce/smlouvě se vazba `PropertyPaymentAccount` automaticky založí/aktivuje.

### Bankovní platby přes e-mail

V21 nepoužívá přímé bankovní API ani autorizační consent workflow.

1. banka odešle notifikaci příchozí platby do centrální IMAP schránky,
2. `InboxPayment` uchová parser/staging výsledek,
3. cílový účet se porovná s `OwnerBankAccount`,
4. VS určí aktivní/budoucí smlouvu v rámci daného účtu,
5. e-mail se materializuje do technického `BankTransaction`,
6. platba se alokuje na nejstarší otevřené předpisy smlouvy.

`BankAccount` je ve V21 pouze technický ledger/source pro standardní transakce (`email-rb`, `manual`); neobsahuje bankovní credentials, consent, API synchronizaci ani stav přihlášení banky.

### Jedinečnost VS

VS je unikátní mezi `ACTIVE` / `FUTURE` smlouvami na stejném `OwnerBankAccount`. Stejný VS může existovat na jiném cílovém účtu.

### Ověření e-mailových notifikací

Ověření se ukládá na `PropertyPaymentAccount`, nikoli globálně na účtu. Každá vazba má deterministický 8místný testovací VS. Platba přesně 1,00 Kč s tímto VS:

- označí vazbu účet ↔ nemovitost jako ověřenou,
- aktualizuje `lastNotificationAt`,
- vytvoří auditní záznam,
- zůstane jako `InboxPayment` ve stavu `IGNORED` a nikdy se nezaúčtuje jako nájemné.

Pokud jeden účet používá více nemovitostí, každá vazba má jiný testovací VS.

### Párování

Priorita běžného párování:

1. ruční pokročilé pravidlo má přednost,
2. cílový účet + VS → konkrétní smlouva,
3. částka se rozloží na otevřené předpisy (plná / částečná úhrada / přeplatek),
4. známý účet plátce pomáhá při chybějícím/chybném VS,
5. nejednoznačný případ zůstává `UNMATCHED` / `SUGGESTED`.

Neznámá platba se nikdy automaticky nezahodí.

## 4. Úkoly a případová vlákna

`Task` obsahuje scope, kategorii, prioritu, stav, odpovědnou osobu a termín. `TaskEntry` je chronologické vlákno (`COMMENT`, `CALL`, `EMAIL`, `PROMISE`, `STATUS`, `SYSTEM`). Příslib úhrady ukládá do konkrétního záznamu také datum a částku, takže historie příslibů zůstává čitelná i po jejich změně.

### Upomínkové případy

Automatické upomínky vytvářejí deduplikovaný případ:

`collection:<leaseId>:<period>` → `Upomínka M/RR · jednotka · nájemník`.

Do vlákna se zapisují automatické e-maily i ruční komunikace. `PROMISE` přenese příslib úhrady na smlouvu a přepne úkol na `WAITING`. Jakmile je po spárování plateb dluh smlouvy nulový, otevřený collection task se automaticky uzavře.

## 5. Revize a povinné kontroly

`ComplianceItem` drží typ kontroly, periodicitu, další termín, kontakt/technika a stav. `ComplianceRecord` uchovává historii provedení, výsledek, poznámku, dokument URL a další termín.

Stavy jsou dynamicky odvozené podle data: po termínu / dnes / brzy / nadcházející / v pořádku / neaktivní.

## 6. Důležité kontakty

`PropertyContact` eviduje provozní kontakty nemovitosti (správce, havárie, elektro, voda, topení, výtah, PO, revizní technik, pojišťovna, úklid, utility atd.). Kontakt může být navázán na revizi.

## 7. Audit a provozní deník

`AuditLog` je property-scoped auditní stopa se systémovou akcí, entitou, uživatelem, časem a JSON detailem. Ruční provozní poznámka je auditní událost `PROPERTY_LOG_NOTE`. Audit se nemaže úpravou běžných entit.

## 8. Dashboardy

### Portfolio

KPI: inkaso, dluh, otevřené úkoly, revize, smluvní termíny, nespárované platby. Sekce „Vyžaduje pozornost“ slučuje finance, úkoly, revize a smlouvy do jedné fronty.

### Nemovitost

KPI: inkaso, dluh, nespárované, smlouvy, revize, úkoly. Přehled obsahuje „Vyžaduje pozornost“, stav objektu, poslední platby a důležité kontakty.

Sekce `Provoz` obsahuje úkoly, revize, kontakty a aktivitu.

## 9. Automatizace

Render používá jediný hodinový cron `flatcloud-rent-scheduler`. V jednom běhu postupně:

1. načte bankovní e-mailové notifikace (pokud je IMAP zapnutý a nastavený),
2. doplní / synchronizuje automatické předpisy a provede splatnou pevnou indexaci,
3. vyhodnotí platební zprávy, upomínky a interní eskalace.

Nenastavený sběrný e-mail je bezpečný stav `skipped`; scheduler kvůli němu nespadne. Přímý bankovní API cron neexistuje.

### Automatické předpisy

`Lease.autoChargesEnabled` zapíná plán předpisů. Doba určitá se generuje do konce smlouvy, doba neurčitá udržuje rolling horizont 12 měsíců. `Charge` má unikátní kombinaci `leaseId + period`, takže opakovaný scheduler nevytváří duplicity. Synchronizace nikdy nepřepisuje předpis, který už má alokovanou platbu. Historické sazby pravidelných položek zůstávají přes `validFrom` / `validTo`.

Pevná indexace používá `indexationEnabled`, `indexationPercentBps` a `nextIndexationAt`. Při výročí vznikne nová verze položky Nájemné a budoucí neuhrazené předpisy se synchronizují.

## 10. Bezpečnost tajemství

IMAP a SMTP hesla jsou šifrovaná pomocí společného `BANK_TOKEN_ENCRYPTION_KEY` (historický název env proměnné zůstává kvůli kompatibilitě nasazení). Bankovní přihlašovací údaje se v aplikaci neukládají, protože nejsou potřeba.

## 11. CI / release

CI nad čistým PostgreSQL spouští:

```bash
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run verify:v20
npm run verify:v21
npm run verify:v21.1
npm run build
```

V21 je v sandbox režimu a migrace `20260825103000_v21_operations_foundation` proto smí odstranit nepoužívaný starý bankovní API model.
