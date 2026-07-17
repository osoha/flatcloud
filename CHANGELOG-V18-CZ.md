# FlatCloud Rent V18 – účty vlastníků a smluv

## Novinky

- více bankovních účtů u každého vlastníka,
- editace, aktivace a bezpečné odstranění nepoužitých účtů,
- povinný výběr konkrétního účtu při přiřazení vlastníka k jednotce,
- převzetí účtu vlastníka do nové nebo upravované nájemní smlouvy,
- účet nájemníka přímo ve smlouvě a jeho použití při prvním párování,
- převod českého domácího čísla účtu na IBAN,
- platební e-maily a QR platby používají účet vybraný pro danou smlouvu,
- doplnění účtů do detailu jednotky a smlouvy.

## Databáze

Nová nedestruktivní migrace `20260717193000_owner_payment_accounts` přidává `OwnerBankAccount`, vazbu na `UnitOwnership` a pole `ownerBankAccountId` a `tenantBankAccount` na `Lease`. Existující napojené účty vlastníků a známé účty nájemníků se podle dostupných dat předvyplní.

## Registry

`.npmrc` i všechny `resolved` adresy v `package-lock.json` používají `https://registry.npmjs.org/`. Ve výsledném archivu nejsou interní artifactory URL.
