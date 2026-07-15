# Nasazení FlatCloud Rent V8 na Render

## 1. GitHub

Nahrajte obsah ZIPu do kořene stávajícího repozitáře a commitněte do `main`.

## 2. Synchronizace Blueprintu

V8 mění `render.yaml` a přidává službu:

- `flatcloud-rent` – webová aplikace,
- `flatcloud-rent-bank-sync` – hodinový Render Cron Job,
- `flatcloud-rent-db` – stávající PostgreSQL.

V Renderu otevřete Blueprint a zvolte **Sync Blueprint**. Pokud Render nabídne vytvoření cron služby, potvrďte ji.

## 3. Povinný šifrovací klíč

Vygenerujte dlouhý náhodný řetězec alespoň 32 znaků a vložte **stejnou hodnotu** do webové i cron služby:

```text
BANK_TOKEN_ENCRYPTION_KEY=...
```

Hodnota slouží k šifrování bankovních tokenů v databázi. Po připojení skutečných účtů ji neměňte bez řízené migrace, jinak nepůjdou uložené tokeny rozšifrovat.

## 4. Česká spořitelna

Po získání údajů z Erste Developer Portalu vyplňte ve webové i cron službě:

```text
CSAS_CLIENT_ID=
CSAS_CLIENT_SECRET=
CSAS_WEB_API_KEY=
CSAS_API_BASE_URL=
CSAS_AUTH_URL=
CSAS_TOKEN_URL=
```

Podle přidělené dokumentace případně upravte:

```text
CSAS_CONSENTS_PATH=/consents
CSAS_ACCOUNTS_PATH=/accounts
CSAS_TRANSACTIONS_PATH_TEMPLATE=/accounts/{accountId}/transactions
CSAS_BALANCES_PATH_TEMPLATE=/accounts/{accountId}/balances
CSAS_SCOPE_TEMPLATE=AIS:{consentId} openid offline_access
```

Callback aplikace nastavte v bankovním portalu na:

```text
https://flatcloud-rent.onrender.com/api/banking/callback
```

Po připojení vlastní domény použijte její finální HTTPS adresu.

## 5. E-mailové pozvánky

Aplikace používá REST API služby Resend. Ve webové službě nastavte:

```text
RESEND_API_KEY=
INVITE_FROM_EMAIL=FlatCloud Rent <pozvanky@vase-domena.cz>
```

Doména odesílatele musí být u poskytovatele ověřená. Bez těchto hodnot aplikace pozvánku vytvoří a zobrazí odkaz k ručnímu předání, ale e-mail neodešle.

## 6. Migrace

Pre-deploy krok automaticky spustí:

```bash
npm run db:migrate
npm run db:bootstrap
```

Nové migrace:

```text
20260715233000_users_cron_history
20260716001000_direct_csas_user_connections
```

## 7. Kontrola po deployi

Ověřte:

1. `/api/health` vrací úspěšnou odpověď,
2. hlavní administrátor otevře **Administrace aplikace**,
3. cron služba má shodný `BANK_TOKEN_ENCRYPTION_KEY`,
4. v detailu objektu se zobrazují sekce **Příchozí platby**, **Banka a pravidla** a **Uživatelé**,
5. Render cron proběhne na začátku následující hodiny.

## 8. Frekvence

Cron se technicky spouští každou hodinu. Hlavní administrátor nastaví v aplikaci 1, 2, 3, 4, 6, 8, 12 nebo 24 synchronizací za den. Aplikace při každém hodinovém běhu vybere pouze účty, u nichž už uplynul příslušný interval.
