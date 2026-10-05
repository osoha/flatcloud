# Audit smluvního generátoru – sandbox

Rozsah: schválený bytový nájem fyzických osob, 36 kombinací délky,
pronajímatele, zastoupení a počtu smluvních nájemců. Podklad a další
mutace: `docs/lease-contract-mutations-20261005.md`.

## Ověřené invariants

- Přehled, články a podpisové bloky vznikají ze stejného validovaného vstupu.
- Krátká určitá varianta neobsahuje indexaci; ostatní mají schválenou
  doložku ČSÚ. Neurčitá varianta nemá konec, prolongaci ani § 2285.
- Služby, celková platba a individuální úrok jistoty se shodují v přehledu
  a textu. Jistota není vyšší než trojnásobek čistého nájemného; nulová
  jistota nemá povinnost placení nebo doplňování.
- Všichni skuteční nájemci jsou identifikovaní a mají podpisové pole.
  Manželé a společný nájem jsou výslovně odlišeni. Členové domácnosti
  se automaticky nestávají smluvními stranami.
- Pronajímatel není odvozen z bankovního příjemce. Chybějící explicitní
  přiřazení zůstává prázdné a vyžaduje doplnění a kontrolu uživatelem.
- Vzor není vydán s pracovním podtitulem, instrukcemi, nevybranými
  variantami nebo nevyplněnými hranatými poli.
- Finální uložené PDF je nový soukromý dokument. Audit obsahuje neměnný
  snímek vzoru, dat i obsahu; soubor má hash. Stará PDF se nepřepisují.
- Vydání nepřepisuje evidenci nájemního vztahu, předpisy, platby ani
  automatickou indexaci. Nevytváří pozvánky nebo e-mailová oznámení.
- Podpisový obrázek pro doklady není souhlasem k podpisu smlouvy a
  nepřenáší se. Výstup zůstává nepodepsaný až do skutečného podpisu.

## Přístup a uložení

Generátor používá skutečného aktivního přihlášeného uživatele. Simulovaný
pohled a nájemník nemohou generovat. Vyžaduje EDIT/ADMIN přesně na jednotce
nebo celé nemovitosti; příznak čtení všech nemovitostí se nepoužije jako
právo zápisu. Origin z cizího webu, neaktuální verze vzoru a neplatný
formulář se odmítnou před zápisem. Oprávnění k dokumentu se znovu ověří
uvnitř transakce. Uložení využívá stávající úložiště a jeho kompenzaci
souboru při selhání databázové transakce.

## Ověření

- `scripts/verify-lease-contracts.ts`: 36 kombinací, shoda přehledu a
  článků, úrok, celková částka, termíny indexace včetně přestupného roku,
  nulová jistota, žádné služby/správce, odmítnutí 13 chybných zadání.
- Prisma validate a aplikace všech 107 existujících migrací na novou
  izolovanou databázi. Balík nepotřebuje novou migraci.
- Produkční build a TypeScript; Playwright ověření formuláře, mobilního
  rozložení, náhledu/PDF, zápisu do izolovaného úložiště, původního hashe
  při novém vydání, soukromí, oprávnění a režimu simulace.
- Čtyři testovací PDF vizuálně zkontrolovaná po všech stranách: krátká
  určitá, neurčitá společnost/manželé/zástupce, nulová jistota bez správce
  a služeb, stresová varianta s osmi nájemci a třiceti službami. Podpisy,
  popisky, QR a okraje zůstávají v tiskové ploše. Finální změna QR
  zkontrolována na koncových stranách bez změny ostatních článků.
- CI obsahuje obsahovou kontrolu i samostatný browser krok s izolovaným
  úložištěm; jeho dokončený výsledek se zaznamená v PR před sandbox merge.

## Praktické limity

Firemní nájemce, podnájem, jiné než bytové jednotky a jiná měna se tímto
vzorem nevydávají. Jejich samostatné struktury jsou rozpracované v dokumentu
mutací, nikoli vydávané jako schválený bytový vzor. Pilot má pevný vzor;
editor vzorů, BankID a elektronické podepisování jsou oddělené navazující
kroky. Převod existující jistoty do nového vztahu vyžaduje vlastní dohodu.

Produkční portál PR #251 byl schválen a nasazen samostatně. Tento smluvní
balík je autorizován pouze pro sandbox. Před produkcí se předloží výstupy
uživateli k odsouhlasení.
