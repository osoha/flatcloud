# FlatCloud Rent V17 – přehled změn

## Nájemní komunikace

- automatický e-mail s platebními údaji a QR kódem před splatností,
- první a druhá upomínka po splatnosti,
- interní upozornění správci a ruční eskalační fáze,
- žádný právní krok ani výpověď se neprovádí automaticky,
- hlavička zprávy vždy vychází z komunikačního nebo hlavního vlastníka nemovitosti.

## Administrace

- SMTP údaje lze upravovat v aplikaci pouze jako hlavní administrátor,
- SMTP heslo se ukládá šifrovaně,
- nastavitelné lhůty, hodina odesílání, předměty a texty zpráv,
- test SMTP a ruční spuštění kontroly,
- pozvánky i upomínky používají společnou SMTP konfiguraci.

## Evidence inkasa

- historie odeslaných, chybných a přeskočených zpráv na kartě jednotky,
- pozastavení automatických upomínek,
- slíbené datum a částka úhrady,
- interní inkasní poznámka.

## Databáze a provoz

- nedestruktivní migrace `20260717170000_rent_notifications`,
- samostatný Render cron `flatcloud-rent-notifications`,
- aktualizovaný `ARCHITECTURE.md`.
