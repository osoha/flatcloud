# Nasazení FlatCloud Rent V13

1. Rozbalte ZIP a nahrajte celý obsah do kořene repozitáře `osoha/flatcloud`.
2. Commitněte změny do větve `main`.
3. Render automaticky spustí:

```bash
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
npm run db:bootstrap
```

## Databázová migrace

V13 přidává nedestruktivní migraci:

```text
20260717080000_property_technical_avatar
```

Migrace přidá technický JSON pasport nemovitosti a datová pole avataru uživatele. Existující data nemění ani nemaže.

## Konfigurace Renderu

V13 nevyžaduje nové proměnné prostředí ani změnu Blueprintu. Avatar se ukládá v PostgreSQL; není potřeba persistentní disk ani externí object storage.

Předchozí automatické zotavení migrace `20260716190000_invitation_unit_ids` zůstává zachováno v `scripts/migrate-deploy.mjs`.
