# Schválená revize E a dokončení portálu — 6. 10. 2026

## Rozsah

Uživatel schválil společný návrh titulní strany smlouvy a dokladu o zaplacení a zadal zapracovat připomínky z konverzace.

- Smlouva: skutečné logo FlatBerry, Inter, modrá paleta, střídmé zaoblení, společný blok pravidelné měsíční částky, splatnosti a platebního QR. Jistota je samostatná. Právní odstavce zůstávají zachované.
- Jmenný seznam osob je samostatný údaj od smluvních nájemců i počtu osob. Předvyplněná aktivní jména musí uživatel ověřit k počátku smlouvy. Historický počet vychází pouze z jednoznačného účinného období; chybějící údaj se neodvozuje.
- Povinná pole mají hvězdičku, `required`/`aria-required` a čitelné upozornění při chybějící hodnotě. Nepovinná pole jsou výslovně označena.
- Platební list k dodatku je samostatná titulní příloha se současnou nebo uloženou budoucí platební verzí. Nejde o generátor právního textu dodatku. Účet, VS a splatnost odpovídají nastavení při vystavení; původní PDF a podpisy se nemění.
- Nově vydané doklady používají stejný vzhled. Archivní `pdfData` se při stažení neregenerují. Čitelný název se sestavuje z uloženého snapshotu, auditní číslo zůstává uvnitř.
- Portál: nejbližší budoucí období, aktuální měsíc a tři poslední uhrazené měsíce. Dluhy po splatnosti zůstávají zvlášť viditelné. Oznámení a úkoly jsou rozbalitelné bez automatického potvrzení. Kontakty lícují se jménem, Můj domov uvádí celou adresu.

## Hranice změn

Finanční výpočty, zaúčtování, pravidla vydávání dokladů a přístupová oprávnění se nemění. Nový export používá `currentUser` a `leaseAccessWhere`, částky a verzi určuje server. Neprovádí zápisy do databáze. Změna neobsahuje migraci.

Produkční podmnožina portál + doklady má samostatný PR #264. Celý generátor smluv, formulář a platební list patří do sandboxové větve.

## Ověření a reprodukce

- Node 22.23.1, stejný jako CI.
- `scripts/verify-contract-occupancy.ts`: období, pražská půlnoc, hranice měsíce/DST, chybějící a nejednoznačné počty, jmenný seznam.
- `scripts/verify-contract-cover.ts`: 6 služeb a 3 osoby na první A4; zachování právních odstavců, 30 dlouhých služeb a 50 dlouhých jmen, meze stránek a přesný QR payload.
- `scripts/verify-lease-contracts.ts`: původních 36 smluvních kombinací.
- `scripts/verify-receipt-design.ts`: běžný doklad, vícestránkové případy včetně 60 položek a 48 úhrad, zachování textu, bezpečné názvy.
- `scripts/verify-lease-payment-cover.ts`: platné a budoucí verze, chybějící složky versus doložená nula, konec nájmu, haléře a dlouhé identity.
- `e2e/tenant-portal-overview.spec.ts`: pět cílených kontrol pořadí a zachování dluhu.
- QR ve skutečně vyrastrované smlouvě i platebním listu byl nezávisle dekódován; částka, CZK a VS souhlasily s testovacími daty.
- Vizuálně zkontrolován běžný a dlouhý dokument. Inter se vkládá celý: fontkit při subsettingu těchto fontů vynechával viditelné glyfy.
- Nezávislý audit zachytil a ověřil opravu duplicitního převzetí osoby a přetoku platebního listu u dlouhých jmen.

Lokální cílené kontroly a TypeScript prošly. Produkční build samostatné produkční podmnožiny prošel. Úplné CI, izolované Prisma migrace a browser smoke jsou povinnou poslední branou; jejich výsledek je evidován v PR pro přesný head SHA. Tento soupis sám o sobě neoznačuje nasazení za dokončené.

## Podklady značky

Logo je odvozené z kanonického `public/landing/logo.webp`. Inter má skutečné váhy Regular, Medium, SemiBold a Bold; součástí je licence `public/fonts/Inter-OFL.txt`. Původní soubory nazvané Raleway nebyly pro tento vzhled použity. Ukázková osobní data a podpisy z návrhového PDF se do repozitáře nepřenášejí.
