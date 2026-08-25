# V21 – ověřovací checklist

Před nasazením musí projít:

```bash
npm ci
npx prisma generate
npx prisma validate
npm run verify:v20
npm run verify:v21
npm run build
```

CI navíc na čisté PostgreSQL spouští `npx prisma migrate deploy`.

Ruční smoke test:

- Portfolio zobrazí Úkoly, Revize, Smlouvy a Nespárované platby v „Vyžaduje pozornost“.
- Nemovitost → Provoz: lze vytvořit úkol, zapsat vlákno, kontakt, revizi a provozní poznámku.
- OWNER_VIEWER vidí úkolové vlákno, ale nemůže ho měnit.
- Automatická upomínka založí/aktualizuje `Upomínka M/RR`.
- Příslib úhrady nastaví stav Čeká, datum a částku.
- Po úplném splacení dluhu se upomínkový případ uzavře.
- Administrace neobsahuje staré bankovní API/synchronizaci/plánovač.
- Nemovitost → Banka a pravidla zobrazí sběrný e-mail a testovací platbu 1 Kč.
- Jeden účet propojený s více nemovitostmi má pro každou vazbu jiný testovací VS.
- Dvě aktivní/budoucí smlouvy na stejném účtu nelze uložit se stejným VS.
