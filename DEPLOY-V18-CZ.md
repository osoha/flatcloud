# Nasazení FlatCloud Rent V18 na Render

1. Nahrajte obsah ZIPu do kořene GitHub repozitáře.
2. Zkontrolujte, že Render používá Node `22.23.1` podle `.node-version` a proměnné `NODE_VERSION` v `render.yaml`.
3. Build command zůstává:

```bash
npm ci --no-audit --no-fund && npm run build
```

4. Pre-deploy command zůstává:

```bash
npm run db:migrate && npm run db:bootstrap
```

Migrace `20260717193000_owner_payment_accounts` je nedestruktivní. Vytvoří číselník účtů vlastníků, doplní volitelné vazby u vlastnictví jednotek a smluv a podle dostupných údajů provede backfill.

Po nasazení doporučená kontrola:

- otevřít profil vlastníka a založit alespoň jeden aktivní účet,
- v editaci jednotky vybrat vlastníka a jeho účet,
- otevřít nebo vytvořit smlouvu a ověřit převzatý účet vlastníka,
- zadat účet nájemníka a ověřit jeho zobrazení v detailu jednotky,
- spustit test SMTP/platební zprávy a zkontrolovat QR platbu.
