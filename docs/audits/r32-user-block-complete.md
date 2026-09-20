# R32B–D — Dokončení uživatelského bloku v sandboxu

Zadání: uživatel 20. 9. 2026 výslovně požaduje dokončit celý zbývající uživatelský blok. Zdroj: Flatberry_Admin_UX_backlog.md v2. Základ: sandbox f43f17b (PR151). Produkce ani main nejsou cílem.

## Rozhodnutí a bezpečnostní hranice

Změna je **riziková v oblasti oprávnění a oddělení identit**. Uživatelské zadání autorizuje náhled cizího účtu a oddělení interních/external účtů. Implementace volí pouze čtení; neumožňuje jednání či zápis jménem jiného uživatele.

- Skutečná session fc_session se nemění. Samostatný podepsaný token náhledu je vázaný na ID/verzi skutečného super-admina i cíle, má vlastní audience a 30minutovou platnost. Cílový účet se znovu načítá v každém požadavku. Deaktivace, odvolání session či neplatný token nesmějí přepnout obsah potichu na administrátorská data.
- Cookie zůstává do ukončení náhledu / konce relace i při expiraci podpisu, aby byl návrat explicitní. Náhled platí pro karty téhož prohlížeče. Vstup i exit provádějí plné přesměrování, nikoli pouhou změnu klientského stavu.
- Proxy přepisuje kontextové hlavičky a blokuje všechny mutující metody včetně server actions. Výjimky jsou pouze vstup/exit, skutečný heartbeat a logout. currentUser kontroluje metodu také samostatně. Čtecí obsah používá cílová oprávnění; levé menu a provozní panel skutečného admina. Formuláře v náhledu jsou neaktivní; globální zápisové zkratky se nezobrazují.
- Správa účtů, globální nastavení a Dovednosti v náhledu vedou na vysvětlení s exitem. Nejde o přístup simulovaného účtu k administraci.

## Členství FlatCloud

Samostatný příznak flatcloudMember, vedle role a grantů na objekty/jednotky. Nové účty mají výchozí externí prostředí. Super-admin má vždy interní kontext. Aditivní migrace zachová interní kontext již explicitně přiděleným členům reportingových skupin; neodvozuje jej z vlastnictví, správy domu, globálního portfolia ani role MANAGER.

Členství se mění v zachovaném editoru účtu s potvrzením změny přístupu a auditem; seznam účtů jej uvádí prostým textem. Samotné členství nedává žádný reportový ani majetkový grant.

Externí obsah nemá akcionářské/kvartální reporty, interní distribuci, FlatCloud Asset, konsolidační sloupec, skupinové předvolby filtrů ani editor interní klasifikace. Omezení platí v přímých cestách/API a v reportových službách. Interní klasifikaci nelze podstrčit při zápisu nemovitosti. Metodika externím účtům nenabízí vyhrazené korporátní kapitoly.

## Soukromé Dovednosti / Avatary domů

- Navazuje na konkrétní schválený mapový prototyp (Library verze 1, nikoli nový náhodný návrh). Není publikovaný v public/: HTML vrací autorizovaná route pouze skutečnému super-adminovi mimo náhled. Neexistuje veřejný anonymní vstup.
- Samostatná tabulka soukromého nastavení dle skutečného userId. Klíč šifruje existující sealSecret/openSecret (AES-256-GCM). API neakceptuje ID účtu klienta. Metadata ukazují pouze configured; klíč pro SDK vydává pouze autorizovaný no-store endpoint. Žádná hodnota v repozitáři, auditu, sdílených preferencích nebo exportu. Očekávaný klientský požadavek Google SDK klíč nutně obsahuje.
- Uložit / Změnit / Zapomenout, automatické použití po obnovení či přihlášení. Adresa, souřadnice, rychlá Onšovecká, 4 pohledy, kamera, čtvercový rámeček a ruční potvrzení budovy/3D. Chyby sítě/klíče/WebGL a timeout nejsou vydávány za chybějící 3D.
- Export přes standardní getDisplayMedia se souhlasem uživatele. Capture Handle ověří právě tuto kartu; jiné karty/okna se odmítají. Overlay se skryje až při zachycení, crop vychází ze skutečného videoframu. Zdrojová lišta je zachovaná jako reálný pás vykreslené mapy, nikoli vymyšlený nápis. Čtvercové PNG má lokální náhled, kontrolu čitelnosti a až pak stažení; stream se vždy ukončí, blob se neodesílá serveru.
- Záběr musí být celý viditelný, kamera stabilní, capture rozměry odpovídající oknu. Prázdný výřez se odmítá. Změna pohledu vyžaduje nové potvrzení. AI zůstává v osobní dovednosti ChatGPT Work, bez připojení placeného API a bez automatického přiřazení fotografie.

## Ověření a otevřená konkrétní podmínka

TypeScript, Prisma validate a production build ověřeny lokálně. Integrační testy R32B–D ověřují oddělení účtů, vynucení zákazu zápisu, revokaci náhledu, přímé URL, členství a zachování grantů, šifrovaný klíč, opětovné načtení/přihlášení, oddělení administrátorů a zapomenutí. Úplný výsledek CI a sandbox smoke se zaznamená do PR.

**Export skutečné Google 3D mapy vyžaduje samostatné vizuální ověření v uživatelském desktopovém prohlížeči s WebGL a ručně uděleným sdílením karty.** Testy JS/stavů/opravení tuto podmínku nenahrazují. Neaktivujeme placené služby; dostupnost geokódování uživatelova konkrétního demo klíče se neslibuje bez jeho ověření. Právní podmínky dalšího použití mapových dat zůstávají dle backlogu otevřené.

Reference API: [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [Google Map3DElement](https://developers.google.com/maps/documentation/javascript/reference/3d-map), [Chrome screen sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls).

Odložené grafické poznámky FB-01..03 se nemění.
