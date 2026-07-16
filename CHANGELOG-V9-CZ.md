# FlatCloud Rent V9 – uživatelé a SMTP pozvánky

## Novinky

- přímé vytvoření aktivního uživatele administrátorem,
- odeslání jednorázové pozvánky přes SMTP,
- výběr první nemovitosti a oprávnění při vytvoření účtu,
- výběr nemovitosti a oprávnění při pozvání,
- čekající pozvánky zůstávají viditelné v přehledu,
- SMTP heslo se ukládá jen v Render Environment.

## Render Environment

Nastavte ve webové službě:

- `SMTP_HOST=smtp.fortion.net`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<uživatelský e-mail>`
- `SMTP_PASSWORD=<nové heslo>`
- `SMTP_FROM_NAME=FlatCloud`
- `SMTP_FROM_EMAIL=<odesílací e-mail>`

Po změně environment variables spusťte nový deploy.
