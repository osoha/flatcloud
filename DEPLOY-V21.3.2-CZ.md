# Nasazení FlatCloud V21.3.2

## Důvod
Produkční migrace V21.3.1 skončila PostgreSQL chybou `22000: range lower bound must be less than or equal to range upper bound`.

Příčinou je historická smlouva, jejíž efektivní konec (`endDate` nebo `terminatedOn`) leží před `startDate`.

## Oprava
- před kontrolou překryvů se nemožné legacy intervaly označí jako `cancelledAt`, záznam se nemaže,
- důvod se uloží jako `Migrace V21.3.2: neplatný historický interval (konec před začátkem)`,
- přidají se DB CHECK constrainty, které další takový interval nepovolí,
- migrace zůstává restart-safe a `migrate-deploy.mjs` automaticky označí předchozí failed pokus jako rolled-back.

## Nasazení
1. Vytvořte zálohu PostgreSQL databáze.
2. Proveďte běžný deploy z `main`.
3. Neměňte Build Command ani další Render nastavení.
4. Ověřte, že build log začíná verzí `flatcloud-rent-production@1.21.3-hotfix.2`.

Pokud migrace zastaví na explicitním hlášení o překryvu smluv nebo duplicitních VS, řešte konkrétní datový konflikt podle logu.
