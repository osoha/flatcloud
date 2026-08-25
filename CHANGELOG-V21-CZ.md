# FlatCloud Rent V21 – UI & Operations Foundation

## Hlavní změny

- nový frontend a informační architektura podle Varianty 1: portfolio a nemovitost jsou orientované na položky „Vyžaduje pozornost“,
- nová globální agenda **Úkoly a případy** včetně vláken, odpovědných osob, priority, termínu a historie komunikace,
- automatické upomínkové případy `Upomínka M/RR`; e-maily, telefonáty, poznámky a přísliby úhrady se ukládají do jednoho vlákna,
- po úplném splacení dluhu se otevřený upomínkový případ automaticky uzavře,
- nové **Revize a povinné kontroly** s termínem, periodicitou, technikem, výsledkem a historií,
- nové **Důležité kontakty** u nemovitosti,
- property-scoped **Aktivita / auditní stopa** a ruční provozní deník,
- expirace a výročí smluv jsou přímo ve „Stavu objektu“ i v globální pracovní frontě,
- odstraněno uživatelské i databázové torzo původního přímého bankovního API napojení a bankovního plánovače.

## Bankovní e-mail

V21 používá jediný koncept: bankovní účet pro nájemné + e-mailová notifikace banky + centrální IMAP schránka.

- jeden účet může přijímat platby od libovolného počtu nájemníků,
- cílový účet vymezí množinu relevantních smluv,
- VS je hlavní identifikátor konkrétní smlouvy,
- částka se použije pro plnou úhradu, částečnou úhradu nebo přeplatek,
- známý účet plátce je pomocná indicie při chybějícím/chybném VS,
- nejednoznačné platby zůstávají ve frontě k ruční kontrole,
- stejný VS nesmí používat dvě aktivní/budoucí smlouvy na stejném bankovním účtu; na různých účtech se stejný VS použít může.

## Ověřovací platba 1 Kč

Ověření je vedeno na vazbě **nemovitost ↔ účet pro nájemné**, nikoli pouze na účtu. Pokud jeden bankovní účet používá více nemovitostí, každá vazba má vlastní testovací VS.

Testovací platba 1,00 Kč:

1. přijde na evidovaný účet,
2. obsahuje unikátní testovací VS dané vazby,
3. potvrdí, že notifikace pro účet a danou nemovitost dorazila do FlatCloudu,
4. je označena jako ověřovací a nezaúčtuje se jako nájemné.

## Databáze

Migrace `20260825103000_v21_operations_foundation` přidává Tasks, TaskEntry, PropertyContact, ComplianceItem, ComplianceRecord, PropertyPaymentAccount a property-scoped AuditLog. V sandbox režimu zároveň odstraňuje nepoužívané tabulky/sloupce původního přímého bankovního API.
