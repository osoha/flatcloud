# FlatCloud Rent – evidence nemovitostí a nájemních plateb V6

Produkční webová aplikace pro správu oddělených portfolií vlastníků/SPV a jednotlivých nemovitostí. Verze V6 rozšiřuje funkční přihlášení a dashboard o skutečnou správu dat v PostgreSQL.

## Funkce V6

- vlastníci, SPV a externí klienti,
- přidání a editace nemovitostí,
- jednotky včetně typu, plochy a stavu,
- nájemníci a známé účty plátců,
- nájemní smlouvy s historií,
- verzované položky pravidelného předpisu s platností od–do,
- hromadné vytvoření měsíčních předpisů,
- editace konkrétního měsíčního předpisu,
- ruční zaevidování platby proti předpisu,
- výpočet salda a přehled dlužníků,
- role a omezení přístupu po nemovitostech,
- audit vytvoření a změn záznamů.

Bankovní napojení zůstává záměrně vypnuté. Výchozí režim je `BANKING_PROVIDER=mock`; sandbox se doplní až po ověření evidence, předpisů a sald.

## Aktualizace existující aplikace na Renderu

1. Zálohujte nebo stáhněte současný GitHub repozitář.
2. Rozbalte tento ZIP.
3. Nahrajte jeho obsah do kořene stejného repozitáře a potvrďte přepsání souborů.
4. Commitněte změny do větve `main`.
5. Render automaticky provede:

```bash
npm ci --no-audit --no-fund
npm run build
npm run db:migrate
npm run db:bootstrap
npm start
```

Migrace `20260715190000_property_management` pouze rozšíří stávající databázi. Administrátora, uživatele ani současné objekty nemaže. U existujících smluv vytvoří výchozí položky „Nájemné“ a „Zálohy na služby“.

Pokud automatický deploy nezačne, v Renderu zvolte **Manual Deploy → Deploy latest commit**. Vyčištění build cache není při této aktualizaci standardně potřeba.

## Doporučený první postup v aplikaci

1. Otevřete **Vlastníci / SPV** a přidejte vlastníka.
2. V portfoliu zvolte **Přidat nemovitost**.
3. V detailu nemovitosti přidejte jednotky.
4. Přidejte nájemníka; formulář současně vytvoří jeho první smlouvu.
5. V sekci **Předpisy** upravte pravidelné položky nájemného a služeb.
6. Vytvořte předpisy pro zvolený měsíc.
7. V sekci **Platby** vložte ruční platbu a ověřte saldo a dlužníky.

## Datová pravidla

- Nemovitost je hlavní bezpečnostní a účetní hranicí.
- Smlouva propojuje nájemníka s jednotkou; historie se nepřepisuje.
- Změna měsíční částky se provádí přes položku s novou platností od určitého data.
- Již vytvořený měsíční předpis se automaticky nepřepíše.
- Ruční platba vytváří auditovaný bankovní záznam se zdrojem „Ruční evidence“.
- Nemovitosti, vlastníci a nájemníci se deaktivují; produkční UI neprovádí destruktivní mazání.

## Render a proměnné prostředí

Ponechte existující proměnné:

- `DATABASE_URL`
- `SESSION_SECRET`
- `INITIAL_ADMIN_NAME`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`
- `BANKING_PROVIDER=mock`

Po úspěšném obnovení přihlášení nastavte `RESET_INITIAL_ADMIN_PASSWORD=false` nebo tuto dočasnou proměnnou smažte.

## Lokální vývoj

```bash
npm ci
npx prisma migrate deploy
npm run db:bootstrap
npm run dev
```

## Ověření balíčku

Frontend a Route Handlers byly zkompilovány pomocí Next.js 16 a prošly TypeScript kontrolou. V pracovním prostředí nebylo možné stáhnout nativní Prisma engine z `binaries.prisma.sh`; standardní Render build jej stáhne během `prisma generate`, stejně jako u předchozí funkční verze.
