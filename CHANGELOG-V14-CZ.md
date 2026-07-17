# FlatCloud Rent V14

## Avatar v sekci Můj účet

- každý přihlášený uživatel může změnit nebo odstranit vlastní avatar v sekci `/ucet`,
- administrátorská editace avataru v profilu uživatele zůstává zachována,
- nahraný PNG, JPG nebo WebP se na serveru automaticky otočí podle EXIF, ořízne na čtverec a převede na WebP 320 × 320 px,
- pro zmenšení se používá kvalitní Lanczos filtr; současně se normalizují i dříve uložené avatary při jejich načtení,
- vstupní limit zůstává 2 MB a kontroluje se MIME typ, signatura i skutečná čitelnost obrázku,
- avatar zůstává uložený v PostgreSQL a bez fotografie se zobrazují iniciály.

## KPI v detailu nemovitosti

Karty na přehledu konkrétní nemovitosti jsou nově klikací:

- Předpis → dvanáctiměsíční report předpisů daného objektu,
- Uhrazeno → report inkasa daného objektu,
- Dluh → saldo a dlužníci daného objektu,
- Jednotky → seznam jednotek objektu,
- Nespárované → fronta plateb ke spárování.

Klikací je také saldo v hlavičce nemovitosti.

## Objektově filtrované reporty

- reporty přijímají volitelný parametr `propertyId`,
- požadovaný objekt se vždy hledá jen mezi nemovitostmi dostupnými přihlášenému uživateli,
- uživatel s přístupem jen k vybraným jednotkám vidí v reportu pouze tyto jednotky,
- breadcrumb a tlačítko zpět vedou na detail vybrané nemovitosti.

## Databáze

V14 nemění Prisma schéma a nepřidává migraci.
