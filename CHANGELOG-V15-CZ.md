# FlatCloud Rent V15 – změny

## Finance a dluh

- Dluh se počítá pouze z aktivních předpisů po uplynutí data splatnosti.
- Předpis splatný dnes ani budoucí předpis není dluhem.
- Budoucí neuhrazený předpis má stav **Předepsáno**.
- Stejná logika se používá na portfoliu, objektu, jednotce i v reportu salda.

## Jednotky

- Celý řádek jednotky je klikací a vede na kartu jednotky.
- Detail jednotky obsahuje nové moduly **Osoby** a **Měřidla**.
- Měřidla lze evidovat i u jednotky bez aktivní nebo historické smlouvy.

## Smlouvy a variabilní symbol

- Smlouva se zakládá jako na dobu určitou nebo neurčitou.
- U smlouvy na dobu neurčitou se zadává pouze počátek.
- Aplikace navrhuje VS z čísla budovy, čísla jednotky a pořadí smlouvy.
- VS se při uložení kontroluje globálně a transakčně proti duplicitám.

## Nájemníci a osoby

- Fyzická osoba: trvalá a korespondenční adresa, e-mail, telefon a poznámka.
- Právnická osoba: IČO, fakturační a korespondenční adresa, fakturační a komunikační e-mail, telefon a poznámka.
- K nájemnímu vztahu lze přidat další osoby v bytě.

## Měřidla

- Studená voda, teplá voda, elektřina VT, elektřina NT a plyn.
- Evidence sériového čísla, jednotky, aktivního stavu a historie odečtů.
- Odečet lze spojit s nájemním vztahem platným v době odečtu.

## Databáze

- Nová nedestruktivní migrace `20260717120000_tenants_occupants_meters`.
- Stávající údaje nájemníků se přenesou do nových podrobných polí.
