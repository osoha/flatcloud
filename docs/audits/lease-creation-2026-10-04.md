# Založení smlouvy a dokumenty – společný sandboxový balík 4. 10. 2026

Základ: sandbox/ux-agent, 431dd7afd11b84a0aa08aae6a0b44d44ac8144e4. Obsahuje již schválený a sloučený PR #245 (měřidla, portál, jistota, filtry a bankovní fronta). Tento navazující PR je součástí stejného uživatelem požadovaného sandboxového vydání. Main ani produkční data se nemění.

## Opravy podle používání

- Účet vlastníka: smlouva jmenuje aktuálního vlastníka a vede rovnou na potvrzení příjemce plateb jednotky. Odtud lze v nové kartě doplnit účet do profilu stejného vlastníka, obnovit seznam a výslovně potvrdit přiřazení. Není třeba zakládat vlastníka ani převádět jednotku. Formulář smlouvy při obnově zachová koncept. Vytvoření účtu samo nepřepisuje příjemce ani existující smlouvy.
- Nájemníci: během smlouvy lze otevřít nový profil a obnovit nabídku. Výchozí nabídka i hlavní registr filtrují vlastní založené profily; sdílené a starší profily zůstávají přístupné po výslovném přepnutí na všechny dostupné. Přístupová pravidla zůstávají autoritativní na serveru.
- Identifikace fyzické osoby: volitelné datum narození, číslo identifikačního dokladu a pasu ve vytvoření, editaci a profilu. Firma tyto údaje nemá. Autor vzniká při vytvoření profilu nebo kombinace profil+smlouva; změna profilu autora nepřepisuje.
- Role: seznam dalších stran se otevře až výběrem konkrétního profilu. Firma může být vědomě smluvní stranou, plátcem či ručitelem. Samostatní obyvatelé se zadávají již při vytvoření smlouvy, nově nebo z dostupných fyzických osob; firma mezi obyvateli není nabídnuta a server ji odmítne.
- Účty nájemníka: nabídka je výhradně z payerAccounts vybraného profilu. Přepnutí nájemníka odstraní účet předchozího. Kdo je vlastníkem konkrétního uživatelem zmíněného účtu RB, bez čtení skutečných dat neurčujeme.
- Finanční evidence: text převzetí starší smlouvy označuje FlatBerry, nikoli korporaci FlatCloud. Jde o obecné zahájení předpisů a převzaté saldo/kauci, nikoli interní konsolidaci. Funkce se zachovává pro všechny historické nájmy, aby nevznikly neočekávané zpětné předpisy.
- Služby: nové smlouvy (včetně kombinovaného založení profilu) umožňují rozpis nazvaných záloh. Součet služeb se odvozuje z položek a nepřidává se k nim další souhrnná položka. Voda, teplo, elektřina a ostatní služby se sčítají konzistentně v rent-roll a vyúčtování. Rozpis je zachován v měsíčních předpisech, náhledu a neměnném snímku protokolu. Existující ručně přidané duplicitní položky se bez podkladu nepřepisují.
- Avatary: karta hlavního nájemníka na jednotce používá TenantAvatar. Výslovně uložená ilustrace nebo fotka identity je vidět i při vypnuté dekorativní grafice Profi.
- Dokumenty: screenshot ukazuje jednotku a její záložku #smlouva, nikoli samostatný detail smlouvy. Upload na jednotce nyní nabízí nájemní smlouvu a dodatek a váže je na vybraný nájemní vztah. Při více smlouvách je výběr povinný. Dokument je dostupný na jednotce i odpovídající smlouvě. Přímo u shrnutí nájmu je též odkaz na nahrání smlouvy/dodatku. Server kontroluje shodu kontextových rodičů a odmítne chybějící smlouvu při uploadu smlouvy jednotky.

## Migrace a dopady

Aditivní migrace přidává volitelná pole Tenant a autora s ON DELETE SET NULL. Autor historických profilů se doplní pouze z jednoznačného zaznamenaného TENANT_CREATED / TENANT_AND_LEASE_CREATED auditu; importovaným a nejasným profilům se autor nevymýšlí. Bez data narození/dokladů zůstávají stávající profily beze změny. Nové rozpisy používají stávající model platebních položek, bez migrace finančních dat. Nahrazení budoucího souhrnu služeb ukončí všechny kategorie služeb před novým souhrnem, aby nedošlo k dvojímu účtování; minulá historie zůstává zachována.

## Ověření a vydání

Prisma validate/generate, TypeScript, regresní kontroly rolí a identifikace/součtů prošly lokálně. Před vydáním musí projít izolované migrace a production build plus celá browser sada. Nové browser scénáře zahrnují skutečné formuláře účtu a příjemce, vytvoření a editaci identifikace/autora, oddělení bankovních účtů, obnovu konceptu a vytvoření smlouvy s rozpisem a obyvateli. Upload PDF se ověřuje zvlášť nad místním paměťovým S3 endpointem (žádné živé úložiště) a následně běží celá původní sada s vypnutým úložištěm.

READY bude doloženo finálními CI běhy. Sandbox deploy se ověří samostatně; merge sám není důkazem živého vydání. Jeden merge do sandboxu po zeleném CI, bez vydání pracovní větve na Renderu, bez main/produkce.
