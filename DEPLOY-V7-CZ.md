# Nasazení FlatCloud Rent V7 na stávající Render službu

1. Rozbalte ZIP a nahrajte celý obsah do kořene stávajícího GitHub repozitáře.
2. Commitněte změny do větve `main`.
3. Render automaticky spustí build a nedestruktivní migraci `20260715220000_multi_owner_banking_rules`.
4. Stávající uživatelé, nemovitosti, jednotky, smlouvy, předpisy a platby zůstanou zachovány.
5. Dosavadní hlavní vlastník každé nemovitosti a jednotky se převede na podíl 100 %.

## První test bez externí bankovní registrace

V Render Environment nastavte:

`BANKING_PROVIDER=mock`

Po deployi otevřete nemovitost → **Banka a pravidla** → připojte **Mock ASPSP**.

## Enable Banking sandbox

Až bude interní párování ověřené, nastavte v Render Environment:

- `BANKING_PROVIDER=enablebanking`
- `ENABLE_BANKING_APP_ID`
- `ENABLE_BANKING_PRIVATE_KEY`
- `ENABLE_BANKING_BASE_URL=https://api.enablebanking.com`

Soukromý klíč nikdy nepatří do GitHubu. Podrobný postup je v `BANKOVNI-SANDBOX-CZ.md`.
