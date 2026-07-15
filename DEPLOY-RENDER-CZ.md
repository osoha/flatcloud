# Nasazení na Render – stručný postup

## A. GitHub

1. Rozbalte ZIP.
2. V soukromém repozitáři klikněte **Add file > Upload files**.
3. Nahrajte obsah rozbalené složky, nikoliv samotný ZIP.
4. Soubory `package.json` a `render.yaml` musí být v kořeni repozitáře.
5. Potvrďte **Commit changes**.

## B. Render

1. Klikněte **New > Blueprint**.
2. Propojte GitHub a vyberte repozitář.
3. Render najde `render.yaml`.
4. Vyplňte jméno, e-mail a silné heslo prvního administrátora.
5. Potvrďte vytvoření web service a PostgreSQL.
6. V logu musí úspěšně proběhnout `prisma migrate deploy` a `db:bootstrap`.
7. Otevřete vygenerovanou `onrender.com` adresu.

## C. Po prvním přihlášení

1. Otevřete **Můj účet** a změňte heslo.
2. Pro vizuální test lze jednorázově spustit `npm run db:seed:demo`.
3. Až test projde, přidejte vlastní subdoménu v Render Settings > Custom Domains.

## D. Co zatím nedělat

Nepřipojujte produkční bankovní účty. Aktuální poskytovatel je pouze `mock`; nejprve se doplní sandbox konkrétního AISP poskytovatele a otestuje párování, duplicity, vratky a obnovení souhlasu.
