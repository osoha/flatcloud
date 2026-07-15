# Aktualizace FlatCloud Rent V6 na Renderu

## GitHub

1. Rozbalte `flatcloud-render-v6.zip`.
2. Nahrajte celý obsah do kořene současného soukromého repozitáře.
3. Potvrďte přepsání existujících souborů.
4. Zkontrolujte, že v kořeni zůstaly `package.json`, `package-lock.json` a `render.yaml`.
5. Commitněte do větve `main`.

## Render

Render by měl automaticky spustit nový deploy. V logu očekávejte zejména:

```text
prisma generate
next build
prisma migrate deploy
Applying migration 20260715190000_property_management
db:bootstrap
```

Migrace je nedestruktivní. Pokud deploy nezačne, použijte **Manual Deploy → Deploy latest commit**.

## Po nasazení

1. Přihlaste se stávajícím administrátorem.
2. Přidejte vlastníka / SPV.
3. Přidejte nemovitost a jednotky.
4. Přidejte nájemníka a smlouvu.
5. Nastavte položky předpisu.
6. Vygenerujte měsíční předpis.
7. Přidejte ruční platbu.

Bankovní sandbox zatím nezapínejte. Další etapa bude řešit napojení banky a automatické párování nad již ověřenými předpisy.
