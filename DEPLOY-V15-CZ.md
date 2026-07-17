# Nasazení FlatCloud Rent V15 na Render

1. Rozbalte ZIP a nahrajte celý obsah do kořene repozitáře `osoha/flatcloud`.
2. Commitněte změny do větve `main`.
3. Render spustí standardní build:

```bash
npm ci --no-audit --no-fund && npm run build
```

4. Pre-deploy spustí:

```bash
npm run db:migrate && npm run db:bootstrap
```

Nová migrace `20260717120000_tenants_occupants_meters` je nedestruktivní. Přidává kontaktní pole nájemníka a tabulky osob, měřidel a odečtů. Existující nájemníci, smlouvy, předpisy a platby zůstávají zachované.

Po nasazení ověřte:

- budoucí předpis není zahrnutý do dluhu,
- smlouvu lze uložit na dobu neurčitou bez data konce,
- navržený VS je unikátní,
- na kartě jednotky lze přidat osobu, měřidlo a odečet.
