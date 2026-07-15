# FlatCloud Rent – Render deployment V2

Produkční základ aplikace pro evidenci předpisů a bankovních plateb po jednotlivých vlastnících/SPV a nemovitostech. Balíček je připraven pro nasazení z GitHubu na Render pomocí Blueprintu `render.yaml`.

## Automaticky vytvořené služby

- Node.js web service ve Frankfurtu,
- placená PostgreSQL databáze ve Frankfurtu,
- interní spojení aplikace s databází,
- automatické databázové migrace před každým nasazením,
- jednorázové vytvoření prvního administrátora,
- HTTPS na Render URL a později na vlastní subdoméně,
- health check `/api/health`.

## První nasazení

1. Nahrajte celý obsah tohoto adresáře do kořene soukromého GitHub repozitáře.
2. V GitHubu ověřte, že `render.yaml` leží přímo vedle `package.json`.
3. V Renderu zvolte **New > Blueprint** a vyberte repozitář.
4. Render načte `render.yaml` a vyžádá tři hodnoty:
   - `INITIAL_ADMIN_NAME`,
   - `INITIAL_ADMIN_EMAIL`,
   - `INITIAL_ADMIN_PASSWORD` – alespoň 12 znaků.
5. Potvrďte vytvoření Blueprintu. Render sestaví aplikaci, vytvoří PostgreSQL, spustí migraci a jednorázově založí prvního administrátora.
6. Po úspěšném deployi otevřete adresu ve tvaru `https://flatcloud-rent.onrender.com` a přihlaste se zadanými údaji.
7. V aplikaci otevřete **Můj účet** a heslo změňte.

## Demo data

Databáze se standardně vytvoří prázdná. Pro vložení tří demonstračních objektů otevřete v Renderu web service a spusťte jednorázový Shell/Job:

```bash
npm run db:seed:demo
```

Příkaz je nedestruktivní a odmítne běžet, pokud už databáze obsahuje nemovitosti.

## Vlastní subdoména

V Renderu otevřete web service > **Settings > Custom Domains** a přidejte například `platby.flatcloud.cz`. Render následně zobrazí DNS záznam, který nastavíte u správce domény. HTTPS certifikát vydá a obnovuje Render automaticky.

## Bankovní integrace

Výchozí hodnota je `BANKING_PROVIDER=mock`. Reálná banka není připojena. Po získání sandboxových údajů open-banking poskytovatele se do Render Environment doplní klientské údaje a konkrétní adaptér.

## Bezpečnostní poznámky

- Nepřidávejte `.env` ani API klíče do GitHubu.
- Databáze je podle `render.yaml` dostupná pouze z interní sítě Renderu.
- Přístupová data prvního administrátora se při dalších deployích nepřepisují.
- Před ostrým připojením banky je nutné doplnit 2FA, reset hesla, monitoring, zálohovací politiku, GDPR dokumentaci a bezpečnostní test.

## Lokální vývoj

```bash
npm ci
npx prisma migrate deploy
npm run db:bootstrap
npm run dev
```

Po změně Prisma modelu vytvořte novou migraci v lokálním vývojovém prostředí a commitněte ji do GitHubu.
