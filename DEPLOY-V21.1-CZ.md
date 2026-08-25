# Deploy V21.1

V21.1 navazuje přímo na V21 v `main`.

## Ověření před merge

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

## Render

Blueprint nově obsahuje jediný hodinový cron `flatcloud-rent-scheduler`. Původní `flatcloud-rent-payment-email` a `flatcloud-rent-notifications` mají po synchronizaci Blueprintu zaniknout.

Web service používá stejné pre-deploy příkazy:

```bash
npm run db:migrate && npm run db:bootstrap
```

Nová migrace je `20260825133000_v21_1_ux_charge_automation`.

## Poznámka k existujícím smlouvám

Migrace nastaví `autoChargesEnabled = true` také u existujících smluv. Scheduler u nich doplňuje pouze chybějící aktuální a budoucí předpisy; uhrazené předpisy ani historické období zpětně nepřepisuje. V sandboxu je toto zamýšlené chování V21.1.

Pokud Render po Blueprint syncu ponechá původní dva cron services jako samostatné existující služby, deaktivujte / odstraňte je až po ověření, že `flatcloud-rent-scheduler` běží úspěšně. Nemají běžet současně s novým schedulerem.
