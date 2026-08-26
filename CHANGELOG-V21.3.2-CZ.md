# FlatCloud V21.3.2 – migration range hotfix

- Oprava PostgreSQL chyby `22000: range lower bound must be less than or equal to range upper bound`.
- Legacy smlouvy s efektivním koncem před začátkem se zachovají v historii a označí jako zrušené (`cancelledAt`).
- Takové záznamy se nezapočítávají do obsazenosti ani do exclusion range constraintu.
- Přidány databázové CHECK pojistky pro nové nezrušené smlouvy: `endDate` ani `terminatedOn` nesmí být před `startDate`.
- Migrace zůstává idempotentní a může být po Prisma `resolve --rolled-back` automaticky opakována přes `scripts/migrate-deploy.mjs`.
