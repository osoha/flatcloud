# Nasazení FlatCloud V21.3

1. Před produkční migrací vytvořte zálohu PostgreSQL databáze.
2. Nahrajte obsah V21.3 do repozitáře / deployment zdroje.
3. Spusťte `npm ci`.
4. Spusťte `npx prisma generate` a `npx prisma validate`.
5. Spusťte `npm run db:migrate` (nebo `npx prisma migrate deploy`).
6. Spusťte `npm run verify:v21.3` a `npm run build`.
7. Nasaďte web a scheduler ze stejného commitu.

## Bezpečnost migrace
Migrace záměrně skončí chybou, pokud v existujících datech najde:
- překrývající se smlouvy na jedné jednotce,
- duplicitní historický variabilní symbol na stejném účtu vlastníka.

Takový konflikt se nemá automaticky přepisovat. Nejdřív se opraví konkrétní historická data a migrace se spustí znovu.
