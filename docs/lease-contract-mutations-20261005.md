# Generátor nájemních smluv a navazující mutace

## Schválený podklad a pilot

Podkladem je `FlatCloud_najemni_smlouva_FO_v1.docx`, verze 2, a
`FlatCloud_pravni_poznamky_a_varianty_v1.docx`, verze 2, obojí upravené
5. 10. 2026 v 10:14 UTC. Generátor kopíruje schválené články z tohoto
podkladu; vybrané části mění pouze podle konkrétní varianty.
Verze vzoru: `FO-2026-10-05-v2`.

| Rozměr | Funkční varianty pilotu |
| --- | --- |
| Doba nájmu | Určitá nejvýše jeden rok bez indexace; víceletá určitá s ČSÚ; neurčitá s ČSÚ |
| Pronajímatel | Fyzická osoba; společnost |
| Jednání | Osobně / statutární jednání; doložené zastoupení |
| Nájemci | Jednotlivec; více společných nájemců; dva manželé |

Těchto 36 kombinací používá společný soubor údajů pro přehled, články a
podpisy. Člen domácnosti se automaticky nestává nájemcem. U všech
společných nájemců se vypíše identifikace a samostatné místo pro podpis.
Neurčitá varianta neobsahuje konec, automatické obnovení ani prodlužování.
Jistota je individuální, nejvýše trojnásobek čistého nájemného. Nulová
jistota odstraní placení, doplňování a vypořádání jistoty. Služby se
vypisují jen podle skutečně zvoleného rozpisu.

ČSÚ doložka vychází z odsouhlasené řady a nemění automatizaci plateb
v aplikaci. První smluvní termín je 1. dubna nejdříve po 12 měsících.
Případné skutečné zvýšení vyžaduje samostatné oznámení a splnění podmínek.

## Uložení a podpis

Příprava je dostupná z dokumentů jednotky a smlouvy. Skutečný pronajímatel
se předvyplní pouze z výslovného přiřazení k nájemnímu vztahu, nikoli z
bankovního účtu. Chybějící identita, oprávnění, katastrální údaje či
individuální úročení se musí doplnit a potvrdit.

Náhled nic neukládá a tiskové PDF nese označení NEPODEPISOVAT. Vydání
vytvoří nový dokument CONTRACT, výchozí `tenantVisible=false`. Auditní
záznam uchovává verzi vzoru, všechny použité údaje, finální přehled a
články; FileAsset uchovává hash vytvořených bajtů PDF. Vydané dokumenty
generátor nikdy nepřepisuje. Podepsaný originál je samostatně nahraný
dokument. Obrázek podpisu pro příjmové doklady se nepřenáší do smlouvy.
QR na konci je pouze autentizovaný odkaz do portálu; neuděluje přístup.
Vydání nepřepisuje evidenci smlouvy, předpisy, úhrady ani indexaci.

## Rozpracované další vzory

Tyto mutace mají samostatný režim a nejsou čistým výstupem pilotu. Není
správné pouze nahradit jméno nájemce ve vzoru pro bydlení fyzické osoby.

| Vzor | Společné údaje | Specifické části a stav |
| --- | --- | --- |
| Nájem právnické osobě | Byt, pronajímatel, platby, služby, jistota, termíny, přílohy | IČO a rejstřík nájemce, účel užívání a skuteční uživatelé, souhlas s přenecháním zaměstnancům či dalším osobám, jednání za obě společnosti; samostatně posoudit použitelný režim nájmu a skončení. Rozpracována struktura; vyžaduje schválený právní text. |
| Podnájem fyzické osobě | Byt, podnájemce, platby, služby, jistota, předání | Nájemce jako podnajímatel, identifikace hlavního nájmu, doložení oprávnění/souhlasu, přenechaný rozsah, závislost a konec na hlavním nájmu, odlišné ukončení. Rozpracována struktura; vyžaduje hlavní smlouvu a samostatný právní text. |
| Dodatek – doba | Identifikace původní smlouvy a všech stran | Výslovně změněný článek, původní a nová doba, účinnost a podpisy všech stran; bez vytvoření nového platebního závazku jistoty. Rozpracována struktura. |
| Dodatek – nájemné | Identifikace původní smlouvy a všech stran | Původní/nové čisté nájemné, účinnost, oddělení služeb, případná změna jistoty jen výslovně; nejde o automatické indexační oznámení. Rozpracována struktura. |
| Předávací protokol – vstup/výstup | Smlouva, jednotka, předávající a přebírající | Skutečný stav, vybavení, vady, klíče, měřidla/čísla/EAN/EIC/odečty, fotografie, skutečně předané dokumenty a podpisy; žádné fiktivní potvrzení bezvadnosti. Rozpracována struktura. |
| Nový nájem s převodem staré jistoty | Původní a nový vztah, strany, jistota | Výslovná dohoda o převodu částky, identifikace původního závazku, vypořádání dosavadního úroku a případný doplatek; zabránit dvojímu požadavku. V pilotu se nepředvyplňuje jako nový vklad. |

## Verze a budoucí správa vzorů

Pilot má pevnou verzovanou šablonu v repozitáři. Plánovaný editor pro
skutečného SUPER_ADMIN nabídne jen známá pole a články, nové koncepty,
porovnání, kontrolní náhled a aktivaci nové verze; žádný spustitelný kód.
Aktivace smí ovlivnit jen budoucí dokumenty, nikdy archiv. Změny vzorů
vyžadují důvod, autora, čas, historii a ověření všech podporovaných mutací.
BankID/elektronické podepisování se integruje jako samostatný krok se
zachováním podepsaného originálu a důkazů, ne jako vložení obrázku podpisu.

## Právní podklady nových mutací

Společný nájem je v pilotu označen odkazem na § 2270 a § 2271, nikoliv
nově vytvořenými sankcemi či vlastními fikcemi doručení. Režim manželů
je výslovně ponechán zákonné úpravě. Kontrolní zdroj MMR:
https://mmr.gov.cz/getmedia/7c070bf4-080a-42c3-bf67-4ba5634a2de8/Metodika-k%C2%A0najemnim-vztahum.pdf.aspx
Základní práva a povinnosti:
https://mmr.gov.cz/cs/ministerstvo/bytova-politika/najemni-vztahy/prava-a-povinnosti-najemce-a-pronajimatele

Tento balík je určen pro sandbox; smluvní generátor není součástí
schváleného produkčního releasu portálu PR #251.
