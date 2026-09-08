# R24 – konkrétní zbývající brány B a H

## B: navržená politika viditelnosti (čeká na samostatné rozhodnutí)

R24-002 mění bezpečnostní hranici. AGENTS.md vyžaduje lidské rozhodnutí; obecné spuštění pipeline není samostatné schválení migrační politiky starých záznamů.

Návrh k rozhodnutí:

- Nová enum viditelnost `OWNER_VISIBLE` / `INTERNAL` na `TaskEntry`. Nový ruční záznam výchozí `INTERNAL`; zveřejnění vlastníkovi je výslovná volba oprávněného správce.
- Staré záznamy zachovat `OWNER_VISIBLE`, protože již byly vlastníkům dostupné. Případné zpětné omezení bude samostatná auditovaná operace na konkrétních záznamech. Žádné automatické zveřejnění dosud neveřejných dat.
- Příloha dědí přísnější viditelnost zdrojového záznamu. Filtr použít v detailu úkolu, katalogu dokumentů, přímém download/preview, reportových kandidátech, exportech i vyhledávání. Samotné skrytí v UI nestačí.
- Interní přístup se odvodí od existujícího editorského oprávnění ke stejnému objektu/jednotce, nikoli jen od názvu role. `OWNER_VIEWER` s přiděleným EDIT slouží jako interní asistent; čtenář s VIEW interní obsah neuvidí.
- Testy: property VIEW, unit VIEW, property EDIT, unit EDIT, SUPER_ADMIN, cizí scope; obsah, metadata i přílohy přes všechny cesty; migrovaná historie a korekce bez rozšíření scope.

Před implementací je nutné schválit zejména zachování staré historie jako OWNER_VISIBLE a nový výchozí INTERNAL. Zatím žádná změna práv ani schématu viditelnosti.

## H: izolované úložiště (čeká na konfiguraci a živý důkaz)

Aplikace podporuje `disabled`, `local`, `s3`, `gdrive`. Sandbox byl auditován s `disabled`. `local` je v produkčním Node buildu výslovně zakázán; tato ochrana se nebude obcházet. Kořenový render.yaml popisuje jinou službu než flatcloud-ux-sandbox a pro tento blok se nemění.

Konkrétní konfigurace existujícího S3 driveru pouze na sandboxové službě:

| Proměnná | Požadovaná hodnota |
|---|---|
| FILE_STORAGE_DRIVER | s3 |
| S3_BUCKET | výhradně testovací bucket pro FlatCloud UX sandbox |
| S3_REGION | region daného testovacího bucketu |
| S3_ENDPOINT | endpoint poskytovatele, jen pokud jej vyžaduje |
| S3_FORCE_PATH_STYLE | podle testovacího poskytovatele |
| S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY | izolovaný účet omezený na daný testovací bucket, vložit jako secrets přímo do hostingu |

Nevkládat secrets do PR, auditu ani chatu. Nepoužívat produkční bucket nebo účet. Přístup ke konfiguraci Render a identita izolovaného bucketu nejsou v tomto pracovním prostředí doloženy.

Následný živý gate s markerem R24_AGENT_QA_2026_09: PDF + fotografie, checksum a metadata, autorizovaný download/preview, nová verze se zachováním staré, vazba na úkol/náklad, VIEW/EDIT/cizí scope, řízená chyba a retry bez duplicit. Žádné nevratné čištění v živém sandboxu. Samostatný Drive gate až s explicitně izolovaným testovacím účtem a složkami; není nahrazen mockem ani S3 testem.
