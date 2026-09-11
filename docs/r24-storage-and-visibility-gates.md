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

## H: schválené sdílené OAuth, oddělená sandboxová složka

Uživatel 2026-09-09 schválil použití stávajícího Google OAuth i zbytkové riziko společných oprávnění. Nevratné mazání, produkční změny, odesílání a veřejná publikace zůstávají zakázány. Potvrzený Render workspace: My Workspace (`tea-d9bpoou1a83c73blflg0`); pouze služba `flatcloud-ux-sandbox` (`srv-dacselkmqu1s73bmjoq0`), větev `sandbox/ux-agent`.

Kořen: [00_Aplikace_Sandbox](https://drive.google.com/drive/folders/1Eh4zB2CZutxJmlK2O8_U5E8OqPUjFOMG).

Připravené nastavení na sandboxové službě, bez změny produkce nebo sdílených environment groups:

| Proměnná | Hodnota / zdroj |
|---|---|
| FILE_STORAGE_DRIVER | `disabled` až do dokončení přípravy, poté `gdrive` |
| GOOGLE_DRIVE_SANDBOX_ROOT_FOLDER_ID | `1Eh4zB2CZutxJmlK2O8_U5E8OqPUjFOMG` |
| GOOGLE_DRIVE_ROOT_FOLDER_ID | `1Eh4zB2CZutxJmlK2O8_U5E8OqPUjFOMG` |
| GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN | stávající OAuth, bezpečně v Render secrets; ne do repozitáře nebo chatu |
| GOOGLE_DRIVE_PROPERTIES_FOLDER_ID | ID podsložky `01_Nemovitosti` |
| GOOGLE_DRIVE_REPORTS_FOLDER_ID | ID podsložky `02_Reporty` |
| GOOGLE_DRIVE_TEMPLATES_FOLDER_ID | ID podsložky `03_Šablony` |
| GOOGLE_DRIVE_ARCHIVE_FOLDER_ID | ID podsložky `04_Archiv` |

Postup po merge ochrany:
1. Zadat obě kořenová ID a ověřit dostupnost OAuth v sandboxu; provider zatím disabled.
2. Přihlásit SUPER_ADMIN a v Administrace → Systém použít **Připravit sandboxové složky**. Kontrola čte všechny Property.googleDriveFolderId a FileAsset klíče včetně náhledů. Chybějící nebo cizí vazba zastaví přípravu před jakýmkoli zápisem. Následně idempotentně vzniknou čtyři podsložky; jejich ID vypíše administrační stránka pro nastavení v Render.
3. Nastavit čtyři ověřená ID a provider gdrive; spustit Test připojení.
4. Živý gate `R24_AGENT_QA_2026_09`: PDF a fotografie, náhledy, autorizovaný download, zachování historie, vazby úkol/náklad, VIEW/EDIT/cizí scope a chyba/retry.

SandboxGoogleDriveFileStorage kontroluje skutečnou cestu rodičů při čtení, zápisu, přejmenování a přesunu. Odmítá zkratky, cykly, nedohledatelnou cestu a změny kořene. Nepřebírá rodiče dodané volajícím. Cleanup pouze ponechá osiřelý soubor pro kontrolu, nikdy neposílá DELETE. Produkční základní ovladač se nemění. Jde o aplikační ochranu, nikoli omezení OAuth u Googlu; souběžné přesuny souborů mimo aplikaci nejsou atomicky zamknuté.

Stav 2026-09-09: PR #95 mergnutý, CI 97/97. OAuth a čtyři podsložky GREEN, provider gdrive; před uploadem 0 property vazeb a 0 FileAssets. H-01 interní PDF/PNG upload a historie GREEN. Uživatel potvrdil zobrazení PNG a download PNG/PDF GREEN; cloudový download zákaz se neobchází. Aktuální SUPER_ADMIN UI ověřeno, ale file chooser pro H-02 COST-01 se zasekl a živý error/retry není dokončen. Modální náhled připraven pro samostatné CI/PR. Post-upload ancestry a živé VIEW/EDIT/cizí scope stále otevřené; H nelze označit hotový. Podrobné rozlišení důkazů v [auditu](audits/r24-agent-audit-2026-09-08.md#h--pokračování-a-oprava-náhledu-2026-09-09).


Aktualizace 2026-09-11: živý modal, COST-01 upload, invalid PNG → valid PDF retry a skutečná ancestry všech 2 property folders / 5 FileAssets jsou GREEN. Připraven H-ROLE případ na existujícím VIEW/EDIT scope; potřebuje obnovené přihlášení omezených účtů. Uživatel schválil administrátorskou obnovu, implementována pro samostatné PR a plný CI gate. Agent nesmí zadat nové živé heslo; poslední krok resetu se předá uživateli podle control-browser. H zůstává IN_PROGRESS, podrobné ID a rozlišení důkazů viz audit.


### Finální stav H — 2026-09-11

Živé brány jsou splněné. Obnova obou účtů potvrzena uživatelem a následným skutečným přihlášením. VIEW zobrazí pouze OWNER_VISIBLE PNG, modal a Esc fungují; interní záznam i zápisové UI jsou skryté. Cizí úkol a náklad vracejí 404. EDIT zobrazí interní PNG a dovolí interní zápis s markerem H-ROLE-EDIT-RETEST. Nový soubor v tomto retestu nevznikl, poslední ancestry audit 2 složek / 5 souborů proto pokrývá všechny testovací přílohy.

Přímé API/metadata a zápisová negativní matice jsou důkazy z izolovaného CI; autorizovaný download je explicitně uživatelský důkaz. Cloudový zákaz downloadu nebyl obcházen. PR #96 (100/100) i PR #97 (103/103) jsou mergnutá a nasazená pouze do sandboxu. H lze po úplném CI a merge uzavíracího dokumentačního PR označit DONE. Přesná ID a rozlišení důkazů viz finální část auditu; zbytek R24 zůstává samostatnou pipeline.
