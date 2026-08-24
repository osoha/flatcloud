# Nasazení FlatCloud Rent V20 na Render

V20 je přímý upgrade V19. Nový e-mailový import využívá stávající hodinový cron `flatcloud-rent-bank-sync`; `render.yaml` proto nepřidává další službu ani nový tarif.

## Nasazení

1. Nahrajte obsah ZIPu do kořene stávajícího repozitáře a commitněte do větve nasazované Renderem.
2. Proveďte **Sync Blueprint** / běžný deploy.
3. Webová služba před startem spustí stávající:

```bash
npm run db:migrate && npm run db:bootstrap
```

Tím se aplikuje nová V20 migrace.

4. Po nasazení otevřete jako hlavní administrátor **Administrace aplikace → Sběrný e-mail bankovních notifikací**.
5. Zadejte IMAP server, port (typicky 993), uživatele / sběrnou adresu, heslo a nechte aktivní TLS.
6. V RB nastavte `Informuj mě` pro **příchozí pohyb** na každém účtu určeném k nájemnému a jako příjemce použijte sběrný e-mail.
7. Ve FlatCloudu zkontrolujte, že účty vlastníků / SPV mají vyplněné číslo účtu + kód banky nebo IBAN a smlouvy mají správný VS.
8. Pro první ověření použijte **Zkontrolovat schránku nyní**. Nejasné položky otevřete přes **Nespárované platby**.

## Bezpečnost

- heslo sběrné schránky není ukládáno v plaintextu,
- web a bankovní cron musí dál sdílet `BANK_TOKEN_ENCRYPTION_KEY` / `SESSION_SECRET` podle V19,
- doporučeno je samostatné heslo / aplikační heslo pouze pro sběrnou schránku,
- schránka má být vyhrazena bankovním notifikacím.

## Rollback

Aplikační rollback na V19 je možný, ale V20 databázové sloupce a tabulka zůstanou v databázi. Jsou aditivní a V19 je ignoruje. Migraci zpět nemažte ručně z produkční DB bez zálohy.
