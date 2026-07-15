# Bankovní sandbox a test párování

## A. Okamžitý interní test bez externí registrace

1. V Renderu nastavte `BANKING_PROVIDER=mock`.
2. Uložte změnu a proveďte nový deploy.
3. V detailu nemovitosti otevřete **Banka a pravidla**.
4. Připojte **Mock ASPSP** a následně účet synchronizujte.

Aplikace vloží čtyři opakovatelné testovací transakce:
- příchozí nájem s VS 1001,
- převod mezi vlastními účty vhodný pro trvalé ignorační pravidlo,
- neidentifikovanou příchozí platbu,
- odchozí bankovní poplatek, který se automaticky ignoruje.

Stejné transakce se při další synchronizaci nezdvojí.

## B. Enable Banking sandbox

1. V Enable Banking Control Panel vytvořte aplikaci typu SANDBOX.
2. Jako povolenou redirect URL vložte:
   `https://flatcloud-rent.onrender.com/api/banking/callback`
   Po připojení vlastní domény přidejte také její callback URL.
3. Stáhněte soukromý PEM klíč a nikdy jej neukládejte do GitHubu.
4. V Renderu nastavte:
   - `BANKING_PROVIDER=enablebanking`
   - `ENABLE_BANKING_APP_ID=<ID aplikace>`
   - `ENABLE_BANKING_PRIVATE_KEY=<celý obsah PEM klíče>`
   - `ENABLE_BANKING_BASE_URL=https://api.enablebanking.com`
5. Proveďte nový deploy.
6. V detailu nemovitosti otevřete **Banka a pravidla** a zvolte **Mock ASPSP** poskytovaný Enable Banking sandboxem.

Sandbox slouží k ověření autorizačního toku, synchronizace a párování. Před produkčním provozem je nutné ověřit smluvní a regulatorní model poskytovatele a dostupnost konkrétních českých bank a firemních účtů.
