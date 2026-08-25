# Nasazení FlatCloud Rent V21

V21 navazuje na V20 a je určen pro současný sandbox režim. Migrace obsahuje záměrný cleanup nepoužívaného přímého bankovního API modelu.

## Doporučený postup

```bash
git switch v20-bank-email-matching
git pull
git switch -c v21-ui-operations-foundation

# po rozbalení V21 do kořene repozitáře
nvm install 22.23.1
nvm use 22.23.1
npm ci
npx prisma generate
npx prisma validate
npm run verify:v20
npm run verify:v21
npm run build

git add -A
git commit -m "V21: UI and operations foundation"
git push -u origin v21-ui-operations-foundation
```

GitHub Actions následně provede stejné ověření nad čistým PostgreSQL včetně `prisma migrate deploy`.

## Render

Web služba provádí `npm run db:migrate && npm run db:bootstrap` před startem. Platební cron `flatcloud-rent-payment-email` jednou za hodinu kontroluje pouze sběrný IMAP e-mail. Starý bankovní API cron ve V21 není používán.
