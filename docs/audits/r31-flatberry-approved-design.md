# R31 — Flatberry, schválená varianta A

Základ: sandbox/ux-agent ae4d379, včetně R30 auditu. Referencí je první A „Lehké záložky“ z Flatberry_varianty_fullscreen.html a poslední odladěný Flatberry_A_tri_obrazovky.html (verze 3). Poslední komentáře uživatele mají přednost před prototypem.

## Přijaté požadavky

- Světlé bílo-modré rozhraní, původní logo Flatberry, bílé hlavičky bez gradientu; vnější obvod stránky a menu bez zaoblení.
- Jedna stálá řada lehkých záložek pod jemnou modrou linkou. Přirozená šířka textů, vodorovný posuv při nedostatku místa. Aktivní záložka plně modrá. A2, tematické řady a zkosené podvěšené záložky jsou překonané návrhy.
- Rozbalené logo vede do portfolia; samostatné tlačítko sbaluje menu. Ve sbaleném menu rozbaluje samotné logo bublinek. Oba stavy malují totožný bitmapový podklad; mění se pouze ořez.
- H1 má ikonu odpovídající navigaci, jejíž skutečná kresba je přibližně vysoká jako kapitálka písma (ne pouze stejně velký SVG box).
- Objekty a jednotky mají skutečnou dostupnou fotografii nebo neutrální ikonu. Kresba obecného avataru vyplňuje přibližně 60–70 % dlaždice. Nejsou použity ilustrační fotografie z návrhu.
- Inkaso má tenký progress bar; bez předpisu je „— / Bez předpisu“. Nulový dluh zelený, kladný červený, bez přemíry odznaků.
- Srovnání inkasa používá skutečné příložené platby a stejnou uplynulou část měsíce. Chybějící srovnání se nedoplňuje vzorovými hodnotami.

## Upřesnění během realizace

Uživatel rozdělil oblíbenost a barvu. Hvězdička v portfoliu posouvá objekt nahoru; archivované objekty zůstávají v samostatné části a řadí se obdobně v ní. Barva se nevybírá v tabulce. Patří na stránku Vzhled objektu / jednotky vedle výběru fotografie či obecné ikony. Nastavení je osobní a ukládá se k účtu, včetně oblíbenosti. Výchozí barva žádná, obnovení „Bez zvýraznění“.

Fotografie se vybírají pouze z přístupných dokumentů daného objektu či jednotky. Přednost má již použitá titulní fotografie reportu, dále první připojená fotografie; osobní výběr má přednost. Nedostupný obrázek přejde na obecnou ikonu. Uživatel si může zvolit obecnou ikonu i při existenci fotografií.

## Rozsah

Společné komponenty a skin jsou aplikované na portfolio, objekty/jednotky, reporty, smlouvy, nájemníky, vlastníky, finance, provoz, dokumenty, metodiku, administraci, účet, přihlášení a pozvánku. Dosavadní oprávnění, finanční workflow a exportní šablony zůstávají autoritativní. Nové funkce superadministrátora a oddělení skupiny FlatCloud patří do samostatného bloku.

R28 audit obsahoval konkrétní doporučení k hierarchii hlavičky, omezení duplicitních ovladačů a čitelnosti tabulek. R30 opravy jsou zachovány. Samostatné údajné noční výstupy agentů asset/grafik nejsou doloženy.

## Ověření

- Produkční build a TypeScript.
- Prisma validace a aditivní migrace samostatné tabulky osobních preferencí v izolované CI databázi.
- Aktualizovaný verifier záložek: očekávání odpovídají schválené A, která nahrazuje R28 zkosení a vynucené vměstnání záložek.
- Regrese porovnání měsíců: chybějící historie, stejné dny, přelom roku, únor.
- Browser smoke: reálné rozměry loga, kresby H1 a avataru; šířky 1920/1440/1024/390; záložky; oblíbenost a perzistence; oddělená barva; odmítnutí cizího foto ID/jednotky.
- Konečný stav CI, PR a sandboxového vizuálního ověření bude doplněn po nasazení.
