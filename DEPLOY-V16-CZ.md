# Nasazení FlatCloud Rent V16 na Render

1. Rozbalte ZIP a nahrajte celý obsah do kořene repozitáře `osoha/flatcloud`.
2. Commitněte změny do větve `main`.
3. Render spustí standardní build:

```bash
npm ci --no-audit --no-fund && npm run build
```

4. Pre-deploy ponechte beze změny:

```bash
npm run db:migrate && npm run db:bootstrap
```

V16 nemění Prisma schéma a nepřidává databázovou migraci.

Po nasazení ověřte:

- v horní liště už není indikátor „Bankovní API“,
- karty a řádky na detailu jednotky vedou na očekávané detaily,
- celý řádek vlastníka a uživatele je klikací,
- smazaná čekající pozvánka zmizí ze seznamu a její odkaz nelze přijmout,
- deaktivovaný účet se nemůže přihlásit,
- levá navigace obsahuje pouze **Administrace aplikace** a **Můj účet** podle oprávnění.
