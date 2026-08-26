# Deploy V21.2

V21.2 navazuje přímo na V21.1 v `main`. Render architektura se nemění: web + jediný hodinový scheduler + PostgreSQL.

## Ověření před merge

```bash
npm ci
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npm run verify:v20
npm run verify:v21
npm run verify:v21.1
npm run verify:v21.2
npm run build
```

## Migrace

Nová migrace je `20260825162000_v21_2_multibank_email`.

- default `InboxPayment.bank` se mění z historického `RB` na `UNKNOWN`,
- historická hodnota `RB` se normalizuje na kód `5500` a případná `CS` na `0800`,
- přidají se `returnPath`, `authenticationResults` a `sourceTrusted`,
- technický provider `rb-email` se přejmenuje na `bank-email`,
- zdroj transakce `email-rb` se přejmenuje na `email-bank`.

Historické transakce ani alokace plateb se nemění.

## Po nasazení

U dříve chybně vyhodnocených bankovních e-mailů není potřeba měnit IMAP checkpoint. Otevřete položku v globální frontě a použijte **Znovu zpracovat parserem**.

Banky bez ověřeného sender adaptéru se po úspěšném rozpoznání zobrazí jako běžná položka k ručnímu potvrzení, nikoliv jako chyba parseru.
