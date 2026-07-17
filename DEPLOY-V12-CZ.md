# Nasazení V12

1. Nahrajte obsah ZIPu do kořene GitHub repozitáře.
2. Commitněte změny do větve `main`.
3. Render automaticky spustí build a pre-deploy migraci.

Nová migrace:

`20260716180000_unit_level_access`

Migrace přidává tabulku oprávnění uživatelů k jednotkám a pole jednotek u pozvánek. Stávající oprávnění k celým nemovitostem zůstávají zachována.

## Hotfix migrace `20260716190000_invitation_unit_ids`

Při předchozím deployi mohla migrace skončit chybou `P3018 / 42P01`, protože odkazovala na tabulku `Invitation`. Tento balíček opravu provede automaticky při běžném pre-deploy příkazu:

```bash
npm run db:migrate && npm run db:bootstrap
```

Není potřeba ručně spouštět `prisma migrate resolve`. Zotavení je omezené pouze na migraci `20260716190000_invitation_unit_ids`; ostatní migrační chyby zůstávají viditelné a deploy zastaví.
