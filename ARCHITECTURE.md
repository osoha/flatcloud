# FlatCloud Rent – architektura projektu

> Tento dokument je živá technická dokumentace. Při každé změně aplikace je nutné aktualizovat relevantní část: databázi, vazby, oprávnění, route, provozní konvence nebo přijatá rozhodnutí.

**Aktualizováno:** 17. 7. 2026  
**Výchozí stav:** FlatCloud Rent V12 RC1  
**Databázové schéma:** `prisma/schema.prisma`

## 1. Účel a základní principy

FlatCloud Rent je interní systém FlatCloud pro správu nájemních nemovitostí. Není navržen jako veřejný SaaS.

Priorita projektu:

1. jednoduchost práce,
2. rychlost běžných operací,
3. stabilita,
4. intuitivní UX,
5. minimální zásahy do fungující architektury.

Základní hierarchie domény:

```text
Portfolio
└── Nemovitost
    └── Jednotka
        ├── Vlastník jednotky
        └── Smlouva
            ├── Nájemník
            ├── Pravidelné položky
            └── Měsíční předpisy
                └── Alokované platby
```

Bankovní tok:

```text
Bankovní autorizace
└── Bankovní účet
    └── Bankovní transakce
        ├── Párovací pravidlo / návrh smlouvy
        └── Alokace na měsíční předpis
```

## 2. Technologie a provoz

- Next.js 16, App Router
- React 19
- TypeScript se zapnutým `strict`
- Prisma 6
- PostgreSQL
- Render Web Service + Render Cron Job
- GitHub, větev `main`
- Node.js 22.23.1 na Renderu
- SMTP přes Nodemailer
- JWT session v HTTP-only cookie

Produkční build:

```bash
npm ci --no-audit --no-fund
npm run build
```

Skript `npm run build` spouští:

```bash
prisma generate
next build
```

Pre-deploy:

```bash
npm run db:migrate
npm run db:bootstrap
```

Cron synchronizace bank běží každou hodinu a podle globálního nastavení vybírá pouze účty, u kterých již uplynul požadovaný interval.

## 3. Struktura repozitáře

```text
app/
├── api/                         API route handlery
├── login/                       přihlášení
├── portfolio/                   hlavní portfolio dashboard
├── nemovitosti/                 detail objektu, jednotek, smluv a plateb
├── uzivatele/                   správa uživatelů
├── vlastnici/                   správa vlastníků / SPV / SVJ
├── nastaveni/                   globální nastavení
├── ucet/                        profil přihlášeného uživatele
└── pozvanka/                    přijetí pozvánky

components/
├── Shell.tsx                    hlavní layout a navigace
├── PropertySubnav.tsx           navigace detailu nemovitosti
└── FormUi.tsx                   sdílené formulářové komponenty

lib/
├── access.ts                    filtrování objektů a jednotek podle přístupu
├── auth.ts                      session, uživatel, role
├── management.ts               permission guardy a audit
├── db.ts                       singleton PrismaClient
├── forms.ts                    parsování FormData
├── route-response.ts           redirect + flash zprávy
├── matching.ts                 párovací engine plateb
├── period.ts                   období a splatnosti předpisů
├── settings.ts                 globální nastavení synchronizace
├── banking/                    adaptéry a synchronizace bank
└── ...

prisma/
├── schema.prisma               jediný zdroj databázového modelu
├── migrations/                 sekvenční nedestruktivní migrace
├── bootstrap.ts                vytvoření / obnova prvního administrátora
└── seed.ts                     volitelná demo data

scripts/
└── banking-cron.ts             hodinová bankovní synchronizace

public/
└── flatcloud-logo.png          logo aplikace
```

## 4. Aplikační vrstvy a tok požadavku

### Serverové stránky

Stránky v `app/` jsou převážně async Server Components. Datové stránky používají:

```ts
export const dynamic = "force-dynamic";
```

Obvyklý tok:

1. `requireUser()` načte přihlášeného uživatele.
2. `requirePropertyAccess()` nebo `requireUnitAccess()` omezí data.
3. Prisma načte entity včetně potřebných vazeb.
4. Server Component vykreslí HTML.

### Zápis dat

Aplikace nepoužívá samostatnou klientskou datovou vrstvu. Formuláře odesílají běžný `POST` do `app/api/**/route.ts`.

Obvyklý tok API route:

1. ověřit session a oprávnění,
2. načíst `FormData`,
3. parsovat hodnoty přes `lib/forms.ts`,
4. ověřit vazbu entity na nemovitost / jednotku,
5. provést Prisma transakci nebo CRUD operaci,
6. uložit auditní záznam,
7. vrátit redirect HTTP 303 přes `go()` / `goWithMessage()`.

Úspěch a chyba se zobrazují přes query parametry `ok` a `error` a komponentu `Flash`.

### Formulářové konvence

- částky se v databázi ukládají jako celé haléře v polích `*Cents`,
- desetinné hodnoty formuláře přijímají tečku i čárku,
- datum formuláře se převádí na UTC v poledne, aby se omezily posuny data,
- enum hodnoty se ukládají v angličtině a zobrazují přes `lib/labels.ts`,
- `Field.min` a `Field.max` jsou čísla, `Field.step` je string.

## 5. Databázový model

### 5.1 Identity a oprávnění

#### `User`

Uživatelský účet aplikace.

Důležitá pole:

- `email` – unikátní login,
- `passwordHash` – bcrypt hash,
- `role` – globální role,
- `active` – možnost přihlášení,
- `allProperties` – přístup ke všem současným i budoucím objektům,
- kontaktní údaje,
- vazby na objekty, jednotky, bankovní připojení a audit.

#### `UserProperty`

Přímé oprávnění uživatele k celé nemovitosti.

- složený klíč `userId + propertyId`,
- oprávnění `VIEW`, `EDIT`, `ADMIN`.

#### `UserUnit`

Existující model V12 pro explicitní přístup uživatelského účtu ke konkrétní jednotce.

- složený klíč `userId + unitId`,
- oprávnění `VIEW`, `EDIT`, `ADMIN`.

**Konvence:** nepřidávat další paralelní tabulku typu `UserUnitAccess`. `UserUnit` je technické oprávnění účtu, nikoli zdroj vlastnictví jednotky.

#### `UserInvitation`

Jednorázová pozvánka do aplikace.

- ukládá pouze hash tokenu,
- platnost je časově omezená,
- podporuje celý objekt, více objektů, konkrétní jednotky nebo všechna portfolia,
- stav `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`.

### 5.2 Vlastnictví a nemovitosti

#### `Owner`

Vlastník, fyzická osoba, společnost, SPV nebo evidenční SVJ.

Je společným zdrojem pro:

- hlavního vlastníka nemovitosti,
- komunikačního vlastníka,
- spoluvlastnictví nemovitosti,
- vlastnictví jednotek,
- přiřazení bankovního účtu.

#### `Property`

Nemovitost / spravovaný objekt.

Hlavní vazby:

- povinný evidenční vlastník `owner`,
- volitelný komunikační vlastník,
- volitelný správce `manager`,
- vlastnický režim `WHOLE_OBJECT`, `UNIT_BASED`, `SVJ`,
- jednotky,
- bankovní účty,
- párovací pravidla,
- uživatelská oprávnění a pozvánky.

#### `PropertyOwnership`

Evidence více vlastníků jednoho objektu.

- unikátní kombinace `propertyId + ownerId`,
- podíl se ukládá v basis points,
- podíly se v aktuálním UI nezobrazují, ale model zůstává zachován.

#### `Unit`

Bytová nebo nebytová jednotka v nemovitosti.

- označení je unikátní v rámci nemovitosti,
- typ, stav, podlaží, plocha a poznámka,
- vazba na vlastnictví, uživatelský přístup a smlouvy.

#### `UnitOwnership`

Kanonický zdroj informace, kdo vlastní konkrétní jednotku.

```text
Owner → UnitOwnership → Unit
```

**Rozhodnutí:** oprávnění nebo zobrazení založené na vlastnictví se má odvozovat z této vazby. Nevytvářet novou M:N tabulku pro vlastnický přístup.

### 5.3 Nájemní vztah a předpisy

#### `Tenant`

Nájemník může být fyzická nebo právnická osoba.

- kontaktní údaje,
- seznam známých účtů plátce `payerAccounts`,
- více smluv v čase.

#### `Lease`

Nájemní smlouva vždy patří jedné jednotce a jednomu nájemníkovi.

- období platnosti,
- den splatnosti,
- variabilní symbol,
- nájem dopředně nebo zpětně,
- základní částky nájmu, služeb a kauce,
- stav `ACTIVE`, `FUTURE`, `ENDED`.

Unikátní je kombinace jednotky a variabilního symbolu.

#### `LeasePaymentItem`

Verzovaná pravidelná položka smlouvy.

Příklady:

- nájemné,
- voda,
- teplo,
- služby,
- parkování,
- korekce.

Položka má platnost `validFrom` / `validTo`, aktivní stav a pořadí.

#### `Charge`

Měsíční předpis.

- vždy patří smlouvě, a tím konkrétní jednotce,
- unikátní kombinace `leaseId + period`,
- období ve formátu `RRRR-MM`,
- splatnost, celková částka, aktivní stav,
- rozpad položek a přijaté alokace.

**Rozhodnutí:** předpisy jsou pouze na úrovni jednotky. Nemají být samostatnou globální entitou mimo vazbu `Unit → Lease → Charge`.

#### `ChargeItem`

Neměnný rozpad konkrétního měsíčního předpisu v okamžiku jeho vytvoření.

### 5.4 Banky a platby

#### `BankAuthorization`

Dočasný autorizační stav při připojení banky.

- patří nemovitosti,
- eviduje poskytovatele, banku a připojujícího uživatele,
- citlivý provider context je šifrovaný,
- stav je časově omezený.

#### `BankAccount`

Bankovní účet patří nemovitosti a volitelně konkrétnímu vlastníkovi.

- poskytovatel a externí ID,
- maskovaný IBAN,
- šifrované credentials,
- stav připojení,
- zůstatek,
- synchronizační stav,
- deduplikace účtu podle `provider + externalAccountId`.

#### `BankMatchingRule`

Pravidlo pro zpracování příchozí platby.

Akce:

- `IGNORE`,
- `MATCH_LEASE`,
- `SUGGEST_LEASE`.

Podmínky mohou kombinovat účet, IBAN protistrany, jméno, VS, zprávu a přesnou částku. Nižší priorita se vyhodnocuje dříve.

#### `BankTransaction`

Příchozí bankovní transakce.

- unikátní kombinace `bankAccountId + externalId`,
- obsahuje plátce, účet, VS, zprávu a částku,
- stav párování,
- volitelné pravidlo a navrženou smlouvu,
- může být rozdělena na více předpisů.

Aktuální produkt zpracovává pouze kladné příchozí transakce.

#### `PaymentAllocation`

Spojovací entita mezi bankovní transakcí a měsíčním předpisem.

- ukládá konkrétní alokovanou částku,
- unikátní kombinace transakce a předpisu,
- umožňuje částečnou úhradu i rozdělení platby.

### 5.5 Systémové modely

#### `AppSetting`

Jeden globální řádek s ID `global`.

- zapnutí automatické bankovní synchronizace,
- počet synchronizací denně,
- poslední začátek, konec a výsledek cron běhu.

#### `AuditLog`

Audit významných změn a systémových operací.

- volitelný uživatel,
- akce,
- typ a ID entity,
- strukturovaný JSON detail,
- čas vytvoření.

## 6. Přehled hlavních vazeb

```mermaid
erDiagram
    User ||--o{ UserProperty : has
    User ||--o{ UserUnit : has
    User ||--o{ UserInvitation : sends
    User ||--o{ AuditLog : creates

    Owner ||--o{ Property : primary_owner
    Owner ||--o{ PropertyOwnership : owns
    Owner ||--o{ UnitOwnership : owns
    Owner ||--o{ BankAccount : owns_account

    Property ||--o{ PropertyOwnership : has
    Property ||--o{ Unit : contains
    Property ||--o{ UserProperty : grants
    Property ||--o{ UserInvitation : invites
    Property ||--o{ BankAuthorization : authorizes
    Property ||--o{ BankAccount : uses
    Property ||--o{ BankMatchingRule : defines

    Unit ||--o{ UnitOwnership : has
    Unit ||--o{ UserUnit : grants
    Unit ||--o{ Lease : has

    Tenant ||--o{ Lease : signs
    Lease ||--o{ LeasePaymentItem : defines
    Lease ||--o{ Charge : generates
    Lease ||--o{ BankMatchingRule : target

    Charge ||--o{ ChargeItem : contains
    Charge ||--o{ PaymentAllocation : receives

    BankAccount ||--o{ BankTransaction : imports
    BankAccount ||--o{ BankMatchingRule : scopes
    BankMatchingRule ||--o{ BankTransaction : matches
    BankTransaction ||--o{ PaymentAllocation : allocates
```

## 7. Oprávnění

### Globální role

| Produktová role | Enum | Chování |
|---|---|---|
| Administrátor | `SUPER_ADMIN` | vše, včetně uživatelů a globálního nastavení |
| Správce portfolia | `MANAGER` | všechna portfolia a objekty |
| Správce objektu | `PROPERTY_MANAGER` | správa přiřazeného objektu podle membership |
| Vlastník / člen | `OWNER_VIEWER` | pouze přiřazené objekty nebo jednotky |

`SUPER_ADMIN`, `MANAGER` a uživatel s `allProperties=true` procházejí kontrolami jako plný portfolio přístup.

### Oprávnění k objektu a jednotce

- `VIEW` – čtení,
- `EDIT` – čtení a editace,
- `ADMIN` – správa objektu a jeho uživatelů.

`lib/access.ts` filtruje načtená data:

- celý objekt přes `UserProperty`,
- konkrétní jednotky přes existující `UserUnit`,
- plný přístup přes globální roli nebo `allProperties`.

`lib/management.ts` chrání zápisové operace:

- `requirePortfolioManager()`,
- `requireManagedProperty()`,
- `requirePropertyAdmin()`.

### Vlastnický přístup

Vlastnictví je doménová skutečnost uložená přes `Owner → UnitOwnership → Unit`. Přímé uživatelské oprávnění `UserUnit` je pouze autorizační vrstva účtu. Tyto dvě věci se nesmí zaměňovat.

Při budoucím propojení účtu s vlastníkem se má nejprve navrhnout minimální vazba uživatele na `Owner` a přístup následně odvozovat z `UnitOwnership`; databázový model se nesmí měnit bez výslovného souhlasu.

## 8. UX a navigace

### Hierarchie obrazovek

```text
/portfolio
/nemovitosti/[id]/prehled
/nemovitosti/[id]/jednotky
/nemovitosti/[id]/jednotky/[unitId]
```

Všechny důležité entity mají být klikací: nemovitost, jednotka, vlastník, nájemník, smlouva, předpis a platba.

### Detail nemovitosti

Dostupné sekce plného objektu:

- Přehled
- Jednotky
- Vlastníci
- Nájemníci
- Smlouvy
- Příchozí platby
- Dlužníci
- Banka a pravidla
- Uživatelé
- Nastavení

Jednotkově omezený uživatel vidí zúženou navigaci a pouze data svých jednotek.

### Detail jednotky

Detail jednotky je hlavní pracovní obrazovka.

Aktuálně implementované části V12:

- Přehled
- Předpisy
- Platby
- Smlouva

Cílové členění produktu:

- Přehled
- Finance
- Předpisy
- Platby
- Smlouva
- Dokumenty
- Historie

`Dokumenty` a samostatná `Historie` zatím nemají databázový model. Nevytvářet jej bez schválení změny Prisma schématu.

### Grafický styl

- používat logo `public/flatcloud-logo.png`,
- světlé interní administrační rozhraní,
- modrá jako primární akcent FlatCloud,
- karty, tabulky a zřetelné stavové štítky,
- minimum modálních oken,
- upřednostnit rychlé serverové formuláře,
- vzhled může vycházet z workflow Zvládneme.cz, nikoli z jeho vizuální identity.

## 9. Bankovní architektura

Primární je bank-first workflow. CSV import není součástí hlavního procesu.

Registry adaptérů je v `lib/banking/index.ts`. Každý adaptér poskytuje společné operace pro autorizaci a synchronizaci.

Aktuální poskytovatelé:

- `csas-premium` – připravený přímý konektor České spořitelny,
- `enablebanking` – volitelný Open Banking konektor,
- `mock` – interní sandbox.

Citlivé tokeny se šifrují pomocí AES-256-GCM a klíče `BANK_TOKEN_ENCRYPTION_KEY`.

Pořadí párování příchozí transakce:

1. aktivní ignorační pravidla,
2. vlastní automatická nebo návrhová pravidla,
3. jednoznačný variabilní symbol aktivní smlouvy,
4. známý účet plátce nájemníka,
5. fronta ke spárování.

## 10. Migrace a změny databáze

Pravidla:

- `prisma/schema.prisma` neměnit bez souhlasu zadavatele,
- každá schválená změna schématu musí mít novou Prisma migraci,
- existující migrace nikdy zpětně neupravovat,
- migrace mají být nedestruktivní, pokud není výslovně rozhodnuto jinak,
- build bez úspěšného `prisma generate` a `next build` se nepředává.

Historie hlavních migrací:

| Migrace | Účel |
|---|---|
| `20260715150000_init` | počáteční nájemní evidence |
| `20260715190000_property_management` | správa objektů, smluv a předpisů |
| `20260715220000_multi_owner_banking_rules` | více vlastníků, banky a párování |
| `20260715233000_users_cron_history` | pozvánky, nastavení a cron historie |
| `20260716001000_direct_csas_user_connections` | přímá ČSAS připojení uživatelů |
| `20260716130000_stable_members_owners_charges` | stabilizace členství, vlastníků a předpisů |
| `20260716180000_unit_level_access` | existující přímá oprávnění `UserUnit` |

## 11. Bezpečnostní konvence

- session cookie je `httpOnly`, `sameSite=lax`, v produkci `secure`,
- `SESSION_SECRET` musí mít v produkci alespoň 32 znaků,
- hesla se hashují bcryptem,
- bankovní tokeny a credentials se neukládají nešifrovaně,
- pozvánky ukládají hash tokenu, ne token,
- tajné hodnoty patří pouze do Render Environment,
- API route musí vždy ověřit, že upravovaná entita patří očekávané nemovitosti / jednotce,
- bezpečnostní hlavičky jsou nastavené v `next.config.ts`.

## 12. Konvence dalšího vývoje

1. Nejdříve načíst celý aktuální projekt a tento dokument.
2. Pracovat nad aktuálním stavem repozitáře, ne nad starším ZIPem.
3. Neměnit architekturu ani databázový model bez výslovného požadavku.
4. Využívat existující helpery, komponenty a route konvence.
5. Nezakládat duplicitní entity nebo paralelní oprávnění.
6. Po změně spustit `prisma generate` a produkční `next build`.
7. Při chybě buildu opravit všechny související chyby, dokud build neprojde.
8. Výstupem iterace je kompletní ZIP pro kořen GitHub repozitáře.
9. Při změně schématu přidat samostatnou migraci.
10. Aktualizovat `ARCHITECTURE.md` a případný changelog.

## 13. Známé hranice aktuální implementace

- `UserUnit` je současná autorizační vrstva V12; cílová doménová logika vlastníka se má opírat o `UnitOwnership`.
- Detail jednotky zatím neobsahuje samostatné sekce Dokumenty a Historie.
- Globální hledání v horní liště je zatím vizuální prvek bez vyhledávací implementace.
- Přímý konektor ČSAS vyžaduje schválené produkční endpointy a přístupové údaje banky.
- README stále historicky používá označení V8; rozhodující je aktuální schéma, migrace a tento dokument.
