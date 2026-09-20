# R33 — Visual polish, sandbox

Autorizace: uživatel 20. 9. 2026 spustil všech 22 evidovaných bodů. Větev vychází z R32 sandboxu 8de08eb. Produkce není cílem.

| Body | Výsledek implementace |
| --- | --- |
| FB01, FB05, FB21 | Generická kresba 68 % SVG rámečku, původní H1 zachováno. Upravit kartu, klikací avatar detailu. Explicitní obecná ikona / dostupná fotografie / soukromý upload. Stejné otočení, výřez 320×320 WebP a validace 2 MB jako uživatelský avatar. Starší automatické prázdné volby nyní znamenají obecnou ikonu; explicitní fotografie zachovány. |
| FB02, FB14, FB20 | Datum reportu jako text, odstraněné duplicitní selekční a interní vysvětlující bubliny. Kontextové české pojmy. Důležitý stav nebo upozornění zůstává. |
| FB03 | Bankovní schránka, Drive a SMTP odkazují na konkrétní nastavení. |
| FB04 | Trend inkasa a dluhu na portfoliu, srovnání finančních KPI v reportech. Stejné uplynulé dny; procentní body odlišené od částek, chybějící podklad není nula. U provozních počtů bez historické evidence se trend nevymýšlí. |
| FB06, FB10 | Historie jednotky ve společném obsahu. Nativní modální dialog nad celou aplikací, bez ořezu tabulkou; kompaktní zarovnané hodnocení, Escape a vrácení focusu. |
| FB07 | Jedny Nájemní vztahy: všechny stavy, plochy, nájmy, služby, kauce, dluh, poznámky; hledání, filtr stavu a CSV. Starý view=contracts zachován jako alias. |
| FB08 | Obecné KPIs nemovitostí, nezávislé na členství FlatCloud. Jen autorizované celé objekty; jednotkový grant neodhalí náklady domu. Definice ročního NOI, Yield, peněžního ROE a LTV; chybějící evidence blokuje příslušný výsledek. |
| FB09 | Uživatelský „snapshot“ nahrazen českými výrazy; interní identifikátory a datové formáty zachovány. |
| FB11 | Historie kontrol a protokoly, dodatečné přiložení přímo u provedené revize, stejný dokumentový upload a přístupová pravidla. |
| FB12 | EDIT/ADMIN jednotky stačí pro její měřidla a odečty. Nadřazené domovní měřidlo není povinné. |
| FB13 | Spotřeba, denní průměr, odhad měsíčních nákladů a zálohy s grafem. Ceny účinné v čase; opravené odečty, změny nájemníků, nulování, chybějící ceny a měrné jednotky. Nejde o vyúčtování; uvnitř intervalu je rozdělení spotřeby rovnoměrné. |
| FB15 | Jediné centrum Reporty s filtrem objektu/jednotky. Staré adresy přesměrovány po kontrole přístupu. MF a historické vstupy v Nastavení → Reporty, historická kvartální data jen pro FlatCloud objekty a členy. |
| FB16, FB17 | Matice zobrazuje skutečné hodnocení. Adresář všech zájemců včetně kontaktů bez příležitosti, hledání, úpravy a přiřazení dalších příležitostí. |
| FB18, FB19 | Světlý/tmavý režim a standardní/široký obsah jedním klikem dole v menu; na mobilu v horní liště. Osobní volby uložené v tomto prohlížeči pod ID uživatele. Široké tabulky využijí monitor. Fotografie se neinvertují. |
| FB22 | DOM pořadí KPI → Vyžaduje pozornost + Stav portfolia → Nemovitosti, shodné na mobilu. |

## Rizika a hranice

- FB12 je uživatelem výslovně autorizovaná oprava hranice zápisu jednotky: sdílený predikát editableUnitWhere, žádný nový grant k domu. Povinný integrační test cizí jednotky a VIEW role.
- Aditivní migrace: privátní obrázek osobní karty, ceny a zálohy měřidel. Žádná destruktivní migrace ani přepis měřených dat.
- V PDF se mění pouze český popisek původu dat „Automaticky vypočtený stav“. Výpočty ani layout PDF se nemění; kontrolní hash rendereru aktualizován po kontrole přesného diffu.
- KPI vychází z evidovaných nákladů; jejich existence sama nezaručuje úplnost evidence. Metodika je přímo u výsledku. Nezadaný úvěr = žádný evidovaný dluh, existující úvěr bez stavu = neznámé financování.
- Výchozí noční režim je ruční osobní volba, nikoli automatická změna podle hodin.

## Ověření

Probíhá: statické kontrakty, výpočty spotřeby, sestavení, migrace a browser regrese v izolovaném CI, následně nasazení a vizuální kontrola skutečného sandboxu.
