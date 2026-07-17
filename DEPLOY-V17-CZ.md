# Nasazení FlatCloud Rent V17 na Render

1. Rozbalte ZIP a nahrajte celý obsah do kořene GitHub repozitáře.
2. Commitněte změny do větve `main`.
3. Render provede `npm ci`, `prisma generate`, `next build`, migrace a bootstrap.
4. Blueprint `render.yaml` obsahuje nový cron `flatcloud-rent-notifications`. Při použití existujícího Render Blueprintu potvrďte synchronizaci změn služeb.

## Povinné prostředí

Web i cron musí používat stejný dlouhý `BANK_TOKEN_ENCRYPTION_KEY`, případně stejný `SESSION_SECRET`, aby bylo možné dešifrovat SMTP heslo uložené administrátorem.

SMTP lze nadále ponechat v proměnných Renderu:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_NAME`
- `SMTP_FROM_EMAIL`

Po migraci je lze komfortně změnit v **Administrace aplikace → SMTP a automatická komunikace k nájmu**. Databázové hodnoty mají přednost.

Automatické odesílání je po migraci ve výchozím stavu vypnuté. Aktivujte je až po kontrole SMTP, lhůt, šablon, bankovních účtů nemovitostí a e-mailů nájemníků.

## Ověření před nasazením

```bash
npm ci --no-audit --no-fund
npm run build
```

Ověřený V17 build prošel `prisma generate`, TypeScript kontrolou, vygenerováním všech stránek a finální optimalizací Next.js.
