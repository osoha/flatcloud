# FlatCloud V21.3.3 – release hotfix pro neplatné historické intervaly

- Opravený release V21.3.2 pokračuje v bezpečném zpracování historických smluv s neplatným intervalem (`endDate` nebo `terminatedOn` před `startDate`).
- Takové záznamy se v migraci neodstraní, ale přesunou do historie jako zrušené (`cancelledAt`) s důvodem `Migrace V21.3.3: neplatný historický interval (konec před začátkem)`.
- Všechny konflikty se řeší v datové vrstvě, nikoli automatickým přepsáním záznamů.
- Přidány DB CHECK constrainty pro nové nezrušené smlouvy: ani `endDate`, ani `terminatedOn` nesmí být před `startDate`.
- Migrace zůstává idempotentní a restart-safe: `scripts/migrate-deploy.mjs` automaticky označí předchozí failed pokus jako `rolled-back` a připraví retry.
- Verze release buildu je `flatcloud-rent-production@1.21.3-hotfix.3`.
