# R24 – konkrétní zbývající brány B a H

## B: schválená politika viditelnosti (2026-09-08)

R24-002 mění bezpečnostní hranici. Uživatel dne 2026-09-08 výslovně schválil předložené zachování historie OWNER_VISIBLE a nový výchozí INTERNAL („ano schvaluji“). Lidská brána dle AGENTS.md je tím pro blok B splněna.

Schválená implementace:

- Nová enum viditelnost `OWNER_VISIBLE` / `INTERNAL` na `TaskEntry`. Nový ruční záznam výchozí `INTERNAL`; zveřejnění vlastníkovi je výslovná volba oprávněného správce.
- Staré záznamy zachovat `OWNER_VISIBLE`, protože již byly vlastníkům dostupné. Případné zpětné omezení bude samostatná auditovaná operace na konkrétních záznamech. Žádné automatické zveřejnění dosud neveřejných dat.
- Příloha dědí přísnější viditelnost zdrojového záznamu. Filtr použít v detailu úkolu, katalogu dokumentů, přímém download/preview, reportových kandidátech, exportech i vyhledávání. Samotné skrytí v UI nestačí.
- Interní přístup se odvodí od existujícího editorského oprávnění ke stejnému objektu/jednotce, nikoli jen od názvu role. `OWNER_VIEWER` s přiděleným EDIT slouží jako interní asistent; čtenář s VIEW interní obsah neuvidí.
- Testy: property VIEW, unit VIEW, property EDIT, unit EDIT, SUPER_ADMIN, cizí scope; obsah, metadata i přílohy přes všechny cesty; migrovaná historie a korekce bez rozšíření scope.

Implementace mění schéma aditivní migrací. Také automatické nové záznamy mají INTERNAL. Viditelnost je neměnná po vytvoření; zpětná redakce ani změna sdílení starých příloh není součástí tohoto bloku. Interní příslib nepropíše text, datum ani částku do sdílených polí smlouvy nebo termínu úkolu. Stav úkolu zůstává sdíleným provozním údajem. Reportové kandidáty a podklady ročního balíčku přijímají pouze OWNER_VISIBLE přílohy; historické zmrazené exporty se nepřepisují.

Regresní gate: `e2e/zzz-r24-task-visibility.spec.ts` obsahuje role/scope matici, tři varianty přímého downloadu, katalogové hledání, zápisy, migraci historie, příslib, reportové fotografie, roční podklady a koncept uvítání. Dokončení úplného CI a merge eviduje samostatné PR bloku B. Živý owner login a skutečné soubory zůstávají samostatným retestem.

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
