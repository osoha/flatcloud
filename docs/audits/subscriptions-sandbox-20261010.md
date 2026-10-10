# Předplatné v nativním sandboxu FlatBerry

Rozsah: pouze existující `flatcloud-ux-sandbox`, větev `sandbox/ux-agent`.
Produkční `main`, databáze a služba se nemění. Pracovní větev vychází ze
sandboxu a obsahuje aktuální opravy `main` již vydané před tímto úkolem.

## Obrazovky

- Administrace → samostatná karta **Tarify a předplatné** (`/nastaveni/tarify`).
- Uživatelé → detail uživatele → **Tarif a platby**. Výběr tarifu, konkrétních
  hrazených objektů či jednotek, kapacity, termínů, individuální nabídky a výjimek.
- Můj účet → **Tarif a platby** (`/ucet/predplatne`). Přehled portfolií,
  funkcí, kapacity, požadavků na úhradu a historie.
- Stávající **Pohled uživatele** zůstává pouze ke čtení. Obsah respektuje
  tarif cílového uživatele, levé menu ponechává administrátorské vstupy.

Jeden plátce může hradit vlastní i samostatná klientská portfolia.
Přiřazení předplatného nepřiděluje práva k datům. Spolupracovníci neplatí
podruhé za tutéž jednotku a nevidí cizí fakturační údaje ani cizí objekty.
Stávající nezařazené objekty jsou během zavádění vedené jako dosavadní přístup;
super-admin je zařadí výslovným výběrem. Nová vlastní registrace začíná Free.

## Výchozí politika k ověření

| Tarif | Měsíční cena včetně DPH | Kapacita | Další jednotka |
| --- | --- | --- | --- |
| Free / Basic | 0 Kč | 3 jednotky, nejvýše 1 objekt | bez rozšíření |
| Profi | 249 Kč | 10 jednotek | 25 Kč / měsíc |
| Enterprise | 990 Kč | 50 jednotek | 15 Kč / měsíc |

Roční období stojí deset měsíčních částek. Ceny a limity lze změnit
v administraci; sjednané ceny se nepřepisují bez výslovného převzetí nového
ceníku. Funkční přepínače se uplatňují podle aktuálního tarifu a platných
individuálních výjimek. Enterprise zpřístupní agregovaný dohled Kvalita a CAPEX
a jeho plán obnovy nad skutečně oprávněným a zvoleným portfoliem. Nepřiděluje
roli super-admina.

Free dovoluje Basic, vlastní správu bez povinného správce, ruční evidenci
plateb, portál nájemníka a ukládání vlastních PDF. Zakazuje analytické reporty,
bankovní notifikace k nájmům, automatické párování, vystavování dokladů a
elektronickou přípravu nových smluv či dodatků. Již uložené dokumenty a
základní export zůstávají dostupné.

Neuhrazené placené portfolio po sedmi celých dnech od expirace přejde pouze
ke čtení. Přihlášení, účet a obnova předplatného zůstávají přístupné. Data
se nemažou a ostatní hrazená portfolia zůstávají použitelná. Nájemník může
předat naléhavou závadu a odvolat souhlas se vstupem. Konec trialu nebo daru
nevytváří dluh: portfolio přejde na Free; při překročení kapacity může
oprávněný uživatel archivovat jednotky či objekt bez smazání historie.

Team je osvobozen pouze u ověřeného vlastního či interního portfolia.
Klientské portfolio není automaticky osvobozené. Nabídky se nesčítají;
procentní a pevná měsíční cena, období zdarma a výjimky funkcí jsou auditované.
Předplatba během trialu nebo darovaného období zachová zbývající bezplatné dny.

## Simulace

V detailu plátce rozbalte **Sandbox: ověřit exspiraci a platbu**.
Testovací datum se ukládá pouze u zvoleného předplatného; lze je vrátit
na skutečný čas. Obnova vytvoří požadavek s částkou, kapacitou, metodou
a referencí. Pouhé vytvoření požadavku neaktivuje tarif.

Super-admin simuluje výsledek. Aktivace vyžaduje potvrzenou úhradu a shodu
částky, měny, reference a příjemce. Chybná nebo nepotvrzená událost jde
ke kontrole. Opakovaná událost ani opakované potvrzení téhož požadavku
neprodlouží předplatné podruhé. Obnova v ochranné lhůtě navazuje na původní
expiraci, po zmrazení začíná od přijetí úhrady. Změna kapacity sjednává
celé nové období; poměrné doúčtování v tomto kroku není součástí simulace.

Karta, Apple Pay, Google Pay a převod jsou pouze simulace. Žádné údaje karty
se nezadávají, žádné peníze ani skutečné e-maily se neodesílají. Souhlas
s obnovou je pouze uložená testovací volba. Účet předplatného a jeho požadavky
jsou oddělené od plateb nájemného. Termíny připomínek jsou zobrazené podle
nastavení; výchozí jsou sedm dnů před expirací, den expirace a pátý den po ní.

## Bezpečnost nasazení

Modul vyžaduje `FLATBERRY_SUBSCRIPTIONS_SANDBOX=1` a přesnou shodu služby
`srv-dacselkmqu1s73bmjoq0`, větve `sandbox/ux-agent` a databáze
`flatcloud_ux_sandbox`. Lokálně smí běžet jen nad izolovanou lokální databází.
Při chybné kombinaci migrátor zastaví před prvním databázovým zápisem.
Mimo povolené prostředí jsou nové API nedostupné a menu modulu skryté.
Nativní ACL, platnost relace i zákaz zápisů v administrátorském náhledu
platí také při přímém volání API. Limity se kontrolují v transakci při
tvorbě, hromadném přidání a obnově archivovaných jednotek i objektů.

## Ověření vydání

Před nasazením jsou vyžadovány izolované migrace, Prisma validate,
TypeScript, doménové verifikace, production build, nativní Playwright
scénáře a audit změn. Výsledky místního ověření jsou přiložené k soukromému
balíčku. Vydání do sandboxu je připravené v PR #276; živé nasazení následuje
až po úspěchu všech požadovaných vzdálených kontrol.

Místní ověření 10. 10. 2026: Prisma generate/validate, 111 izolovaných
migrací, TypeScript, 22 doménových kontrol, production build a 20 browser
scénářů prošlo. Browser scénáře nemají přeskočený ani opakovaný test.
Samostatně prošlo sedm kontrol chyby databáze při ověření relace a náhledu.
Po scénářích se změnil jen popisek kapacity tarifu na formulaci bez chybného
skloňování; kontrola TypeScriptu a diffu se zopakovala.

Vzdálený workflow **Subscription sandbox** (běh 38051239100) ověřil totožný
aplikační strom: 111 migrací, 22 doménových kontrol a 20/20 browser scénářů.
Prošly i workflow R26 Hardening, Portfolio owner filter, User settings and
tenant portal a Sandbox debt and popup verification. Obecné FlatCloud CI
odhalilo zastaralou statickou kontrolu přímého volání transakce v ověřování
Google Drive a hromadné tvorby jednotek. Kontroly jsou aktualizované na
aktuální transakční obal; zachovávají ověření pořadí zápisů a návazných akcí
i serializovatelnost.
Finální obecné CI je povinná brána před nasazením.

V opakovaném obecném CI (běh 38051952823) prošel celý build a 281 browser
scénářů. Obecný běh s vypnutým modulem objevil také devět scénářů předplatného;
jejich bezpečnostní příprava správně odmítla chybějící explicitní sandboxový
příznak. Playwright proto tyto scénáře objevuje pouze při příznaku `1`.
Izolace databáze i všechna tvrzení devíti scénářů zůstávají beze změny.
Samostatný workflow předplatného (38051952824) s explicitním příznakem
znovu prošel 20/20 scénářů; opravené obecné CI musí následně rovněž uspět.

Zdrojový repozitář `osoha/flatcloud` je veřejný. Dne 10. 10. 2026 uživatel
po vysvětlení rozdílu mezi zveřejněním zdrojového kódu a přístupem do aplikace
výslovně schválil původní cestu přes tento repozitář. PR #276 míří pouze do
`sandbox/ux-agent`. Stávající Render služba, URL i databáze zůstávají stejné;
přístup do aplikace nadále vyžaduje přihlášení. Soukromá kopie repozitáře se
pro toto vydání nepoužívá. Produkční `main`, služba, databáze ani prostředí
se v tomto úkolu nemění.
