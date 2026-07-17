# Nasazení FlatCloud Rent V14

1. Rozbalte ZIP a nahrajte celý obsah do kořene repozitáře `osoha/flatcloud`.
2. Commitněte změny do větve `main`.
3. Render automaticky spustí:

```bash
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
npm run db:bootstrap
```

## Databáze

V14 nemění Prisma schéma a neobsahuje novou migraci. Existující migrace V13 a automatické zotavení starší pozvánkové migrace zůstávají beze změny.

## Závislosti

V14 přidává knihovnu `sharp` pro bezpečné serverové zmenšení, ořez a převod avatarů. `npm ci` ji nainstaluje podle `package-lock.json`; nejsou potřeba nové proměnné prostředí ani persistentní disk.
