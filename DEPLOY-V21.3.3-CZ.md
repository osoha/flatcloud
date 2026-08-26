# Nasazení FlatCloud V21.3.3

## Důvod
Produkční migrace V21.3.2 a předchozích V21.3 verzí může narazit na PostgreSQL chybu `22000: range lower bound must be less than or equal to range upper bound` při zpracování historické smlouvy, jejíž efektivní konec leží před začátkem.

## Oprava
- před kontrolou překryvů se neplatné legacy intervaly označí jako `cancelledAt`,
- důvod se uloží jako `Migrace V21.3.3: neplatný historický interval (konec před začátkem)`,
- vazby se nezapočítávají do obsazenosti ani do exclusion range constraintu,
- do přidružených datových pravidel se vloží CHECK constrainty pro nové nezrušené smlouvy,
- migrace je idempotentní a bezpečně retryovatelná po Prisma `resolve --rolled-back`.

## Nasazení
1. Vytvořte zálohu PostgreSQL databáze.
2. Proveďte běžný deploy z `main` nebo z aktuálního release branchu.
3. Neměňte Build Command ani jiné Render nastavení.
4. Ověřte, že build log začíná verzí `flatcloud-rent-production@1.21.3-hotfix.3`.
5. Spusťte `npm run verify:v21.3` po migraci a před produkčním rozjetím.

Pokud migrace hlásí překryvy smluv nebo duplicitní VS, řešte konkrétní konflikt v datech. Neodstraňujte záznamy bez ověření původu dat.
