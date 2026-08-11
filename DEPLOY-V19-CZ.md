# Nasazení FlatCloud Rent V19 na Render

V19 opravuje problém, kdy ruční SMTP/upomínka z webové aplikace fungovala, ale samostatný Render cron nedokázal dešifrovat stejné SMTP heslo.

## Nasazení

1. Nahrajte obsah ZIPu do kořene repozitáře.
2. Proveďte běžný deploy/sync Blueprintu podle `render.yaml`.
3. Databázová migrace pro V19 není potřeba; stávající pre-deploy příkaz zůstává beze změny:

```bash
npm run db:migrate && npm run db:bootstrap
```

4. `render.yaml` propojuje kryptografické a SMTP fallback proměnné cron jobu s webovou službou pomocí `fromService ... envVarKey`. Díky tomu oba procesy používají stejné hodnoty.

## Kontrola po deployi

Doporučený postup:

1. Administrace → **Odeslat test SMTP na můj e-mail**.
2. Administrace → **Spustit kontrolu upomínek nyní**.
3. U testovací jednotky zkontrolovat modul **Upomínky a komunikace**.
4. Pokud chcete obejít kalendář, otevřít **Vynutit rozeslání mimo kalendář**, projít náhled a potvrdit odeslání.
5. V Renderu lze u cron jobu `flatcloud-rent-notifications` zkontrolovat Runs/Logs; V19 zapisuje chyby a přeskočení i do stderr logu s identifikací nemovitosti a jednotky.

Historické záznamy se stavem `FAILED` nebo `SKIPPED` se při další oprávněné kontrole mohou znovu zkusit odeslat. Úspěšně odeslané (`SENT`) se znovu neposílají.
