import s from "../landing.module.css";
export const metadata = { title: "Právní informace | FlatBerry" };
export default function LegalPage() {
  return (
    <main className={s.landing}>
      <article className={s.legal}>
        <a href="/">← Zpět na FlatBerry</a>
        <h1>Právní informace</h1>
        <p>
          Informace o ochraně osobních údajů se vztahují na web i celou aplikaci
          FlatBerry. Verze pro testovací provoz, aktualizováno 25. září 2026.
        </p>
        <nav aria-label="Právní informace">
          <a href="#osobni-udaje">Ochrana osobních údajů</a>
          <a href="#cookies">Cookies a místní úložiště</a>
          <a href="#podminky">Podmínky používání</a>
        </nav>
        <h2>Provozovatel a kontakt</h2>
        <p>
          Flat Cloud a.s., IČO 23111780
          <br />
          Houškova 561/4, Východní Předměstí, 326 00 Plzeň
          <br />
          Krajský soud v Plzni, oddíl B, vložka 2257
          <br />
          <a href="mailto:info@flatcloud.cz">info@flatcloud.cz</a>
        </p>
        <h2 id="osobni-udaje">Ochrana osobních údajů</h2>
        <p>
          Tento přehled vysvětluje práci s osobními údaji návštěvníků,
          uživatelů, vlastníků, nájemníků, spolunájemníků, plátců, zájemců o
          nemovitosti a dalších osob evidovaných v aplikaci. Rozsah údajů závisí
          na využívaných funkcích a údajích vložených oprávněnými uživateli.
        </p>
        <h3>Kdo je správcem a kdo zpracovatelem</h3>
        <p>
          Flat Cloud a.s. je správcem údajů, u nichž určuje vlastní účel
          zpracování: zejména při provozu uživatelských účtů, komunikaci o
          službě a zajištění její bezpečnosti.
        </p>
        <p>
          U údajů vložených zákazníkem pro správu jeho nemovitostí určuje účel a
          právní důvod zpravidla zákazník, vlastník nebo správce nemovitosti.
          Flat Cloud a.s. zde vystupuje jako poskytovatel aplikace a
          zpracovatel, případně další zpracovatel, podle konkrétního smluvního
          uspořádání. Pokud Flat Cloud a.s. sama určuje účel správy konkrétního
          portfolia, může být u této agendy správcem.
        </p>
        <p>
          Tyto informace nenahrazují informační povinnost konkrétního vlastníka
          či správce vůči nájemníkům ani smlouvu o zpracování podle čl. 28 GDPR.
          Přesné rozdělení odpovědností musí odpovídat vztahu k dané
          nemovitosti.
        </p>
        <h3>Jaké údaje aplikace zpracovává</h3>
        <ul>
          <li>
            <strong>Účty a spolupráce:</strong> jméno, e-mail, případně telefon,
            titul a avatar, zabezpečený otisk hesla, role, oprávnění, pozvánky,
            nastavení a stav registrace.
          </li>
          <li>
            <strong>Nemovitosti a nájemní vztahy:</strong> identifikace
            vlastníků, nájemníků a dalších smluvních stran, kontaktní, trvalé,
            korespondenční a fakturační adresy, propojení s domem či jednotkou,
            smlouvy, obsazenost a související dokumenty.
          </li>
          <li>
            <strong>Platby a provoz:</strong> účty plátců, identifikace plateb,
            částky, variabilní symboly, zprávy pro příjemce, předpisy,
            nedoplatky, jistoty, náklady, odečty, spotřeba, vyúčtování a
            vypořádání, pokud se vztahují k identifikovatelné osobě.
          </li>
          <li>
            <strong>Komunikace a dokumenty:</strong> komentáře, úkoly, zmínky,
            přílohy, fotografie, e-mailová oznámení, doručovací záznamy a
            podklady k revizím nebo pojistným událostem.
          </li>
          <li>
            <strong>Distribuce a reporty:</strong> kontakty a požadavky zájemců,
            přiřazení k příležitostem, komunikace, reporty a další podklady
            dostupné podle oprávnění.
          </li>
          <li>
            <strong>Bezpečnost a provoz služby:</strong> přihlašovací relace,
            poslední aktivita, auditní historie změn a technické záznamy. Při
            poskytování webu mohou hostingové systémy zaznamenávat IP adresu,
            čas požadavku a údaje o prohlížeči.
          </li>
        </ul>
        <p>
          Údaje pocházejí přímo od vás, od zákazníka a jím pověřených uživatelů,
          ze smluv a vložených dokumentů, podporovaných importů a bankovních
          oznámení nebo z připojených služeb. Do poznámek a příloh vkládejte
          pouze potřebné údaje; citlivé informace a kopie dokladů nepatří do
          aplikace bez konkrétního zákonného důvodu a odpovídajícího
          zabezpečení.
        </p>
        <h3>Účely a právní důvody</h3>
        <ul>
          <li>
            <strong>Poskytování služby a vedení účtu:</strong> plnění smlouvy
            nebo kroky před jejím uzavřením podle čl. 6 odst. 1 písm. b) GDPR,
            je-li uživatel smluvní stranou. U pověřených pracovníků zákazníka
            jde zpravidla o oprávněný zájem na zajištění přístupu a spolupráce
            podle písm. f).
          </li>
          <li>
            <strong>Podpora a vyřízení dotazů:</strong> plnění smlouvy nebo
            oprávněný zájem na odpovědi a řešení požadavku, podle povahy
            kontaktu.
          </li>
          <li>
            <strong>Ochrana účtů, evidence změn a řešení incidentů:</strong>{" "}
            oprávněný zájem na bezpečnosti služby, prevenci zneužití a ochraně
            práv. Provozní upozornění slouží k používání aplikace a správě
            agendy.
          </li>
          <li>
            <strong>Zákonné povinnosti:</strong> čl. 6 odst. 1 písm. c) GDPR,
            pokud na konkrétní zpracování dopadá příslušná povinnost.
          </li>
          <li>
            <strong>Agenda správy nemovitostí:</strong> účel a právní důvod
            stanoví příslušný správce údajů. Může jít o plnění nájemní smlouvy,
            zákonnou povinnost nebo oprávněný zájem; samotné vložení údajů do
            FlatBerry právní důvod nevytváří.
          </li>
        </ul>
        <p>
          Pokud by některé volitelné zpracování vyžadovalo souhlas, musí být
          vyžádán samostatně a pro konkrétní účel. Otevření stránky ani založení
          účtu samo o sobě nepředstavuje obecný souhlas s libovolným využitím
          údajů. Bez údajů nezbytných pro účet či požadovanou funkci nemusí být
          možné tuto službu poskytnout; volitelné údaje povinné nejsou.
        </p>
        <h3>Kdo má k údajům přístup</h3>
        <p>
          V aplikaci se přístup řídí rolemi a přidělenými oprávněními k
          nemovitostem a jednotkám. Údaje mohou být zpřístupněny pověřeným
          kolegům, vlastníkům a dalším spolupracovníkům. Dokumenty a oznámení
          mohou obdržet příjemci zvolení oprávněným uživatelem. Příjemcem mohou
          být také orgány veřejné moci, vyžaduje-li to zákon, nebo odborní
          poradci při ochraně práv.
        </p>
        <p>
          Na technickém provozu se podílejí poskytovatelé hostingu, databáze,
          úložiště, záloh a e-mailových služeb. Testovací prostředí je hostované
          na Renderu. Aplikace podporuje připojení Google Drive a úložišť
          kompatibilních s S3 a používá nakonfigurované e-mailové služby;
          dostupnost podpory neznamená, že jsou všechny služby aktivní.
          Konkrétní příjemci a rozsah předaných údajů závisejí na prostředí a
          zapojených službách.
        </p>
        <h3>Předávání mimo Evropský hospodářský prostor</h3>
        <p>
          Nelze obecně slíbit, že všechna data zůstávají v EHP: záleží i na
          umístění infrastruktury, podpoře a dalších zpracovatelích dodavatelů.
          Pokud dochází k předávání mimo EHP, musí být doložen odpovídající
          mechanismus podle kapitoly V GDPR, například rozhodnutí o odpovídající
          ochraně nebo standardní smluvní doložky a případná doplňující
          opatření. Informace o konkrétních příjemcích, zemích a použitých
          zárukách v daném prostředí si můžete vyžádat na uvedeném kontaktu.
        </p>
        <h3>Jak dlouho údaje uchováváme</h3>
        <p>
          Rozhodující je účel, trvání vztahu a případné zákonné povinnosti nebo
          potřeba ochrany práv. Údaje účtu jsou potřebné po dobu jeho používání;
          po ukončení se posuzuje, které údaje lze odstranit a které je nutné
          omezeně uchovat. U podpory je rozhodující vyřízení požadavku a
          nezbytná návazná evidence, u bezpečnostních záznamů řešení incidentů a
          přiměřená doba pro jejich odhalení.
        </p>
        <p>
          Dobu uchování nájemních, platebních a dalších zákaznických záznamů
          určuje příslušný správce podle konkrétní agendy, svých povinností a
          pokynů zpracovateli. Archivace nemovitosti či deaktivace účtu sama o
          sobě neznamená výmaz údajů. Uchování dokladů nelze bez posouzení
          zkrátit pouhým ukončením účtu.
        </p>
        <p>
          Pro původní obsah bankovních e-mailových oznámení obsahuje aplikace
          retenční mechanismus s hranicí 100 dnů od přijetí. Odstranění provádí
          úklidová úloha; úspěšnost odstranění zprávy z připojené schránky
          závisí i na jejím nastavení. Strukturované platební údaje mají odlišný
          účel a tímto úklidem se nemažou. Tato lhůta neplatí pro celou
          databázi, dokumenty ani zálohy.
        </p>
        <p>
          Výmaz z aktivního prostředí a doběhnutí záloh jsou odlišné kroky.
          Konkrétní retenční lhůty záloh, provozních logů a postup při ukončení
          služby musí odpovídat nastavení daného prostředí; jejich ověření je
          součástí dokončení provozních pravidel před veřejným spuštěním.
        </p>
        <h3>Vaše práva a jejich uplatnění</h3>
        <p>
          Za podmínek GDPR máte právo na přístup, opravu, výmaz, omezení
          zpracování a přenositelnost údajů. Proti zpracování založenému na
          oprávněném zájmu můžete vznést námitku; proti přímému marketingu
          kdykoliv. Souhlas lze odvolat, aniž by tím byla dotčena zákonnost
          předchozího zpracování. Výmaz ani přenositelnost nejsou bezpodmínečné
          a mohou být omezeny zákonnými povinnostmi či právy dalších osob.
        </p>
        <p>
          Kontaktujte <a href="mailto:info@flatcloud.cz">info@flatcloud.cz</a>{" "}
          nebo provozovatele na výše uvedené poštovní adrese. U údajů
          spravovaných zákazníkem se můžete obrátit přímo na svého vlastníka či
          správce nemovitosti; žádost doručenou Flat Cloud a.s. pomůžeme
          nasměrovat příslušnému správci. Při důvodných pochybnostech může být
          nutné přiměřeně ověřit totožnost žadatele.
        </p>
        <p>
          O vyřízení žádosti příslušný správce informuje bez zbytečného odkladu,
          zpravidla nejpozději do jednoho měsíce. U složitých nebo početných
          žádostí lze lhůtu za podmínek GDPR prodloužit o další dva měsíce; o
          důvodech musí informovat v prvním měsíci. Máte také právo podat
          stížnost u{" "}
          <a href="https://uoou.gov.cz/verejnost/stiznost-na-spravce-nebo-zpracovatele">
            Úřadu pro ochranu osobních údajů
          </a>{" "}
          nebo jiného příslušného dozorového úřadu a využít soudní ochranu.
        </p>
        <h3>Automatizace a zabezpečení</h3>
        <p>
          FlatBerry provádí například párování plateb, výpočty, zobrazení
          upozornění a tvorbu reportů. Tyto funkce samy nepředstavují rozhodnutí
          o přijetí nájemníka, ukončení nájmu nebo jiný právní úkon vůči
          člověku. Za rozhodnutí a přiměřené použití výstupů odpovídá příslušný
          uživatel či správce.
        </p>
        <p>
          Aplikace používá přihlašovací relace, otisky hesel, role, omezení
          přístupu a auditní záznamy. Oprávnění musí správce průběžně udržovat a
          přílohy či exporty sdílet jen s určenými příjemci. Podezření na
          neoprávněný přístup nebo únik údajů oznamte bez prodlení
          provozovateli.
        </p>
        <h3>Rozsah této testovací verze</h3>
        <p>
          Přehled pokrývá celou aplikaci, nikoliv jen landing page. Před
          veřejným spuštěním zbývá provozně potvrdit konkrétní seznam
          zpracovatelů a jejich země, smluvní záruky předávání, retenční plán
          záloh a logů a smluvní úpravu zpracování zákaznických dat. Tento
          dokument sám nezavádí výmazové mechanismy ani nenahrazuje jejich
          ověření.
        </p>
        <h2 id="cookies">Informace o cookies</h2>
        <p>
          Úvodní stránka nepřidává analytické ani reklamní cookies a nenačítá
          reklamní či analytické skripty. Obrázky a písma jsou poskytovány přímo
          s webem.
        </p>
        <p>
          Pro přihlášení aplikace používá nezbytnou cookie{" "}
          <code>fc_session</code> s maximální platností 12 hodin.
          Administrátorský náhled uživatele používá samostatnou nezbytnou cookie
          s maximální platností 12 hodin. Odhlášení tyto přihlašovací cookies
          odstraňuje.
        </p>
        <p>
          Místní úložiště prohlížeče uchovává například volbu rozbalení
          navigace, šířku zobrazení nebo sbalení přehledu portfolia. Úložiště
          relace si pamatuje odložení průvodce a kontext navigace. Nastavení v
          místním úložišti může zůstat i po odhlášení, dokud je nezměníte nebo
          nevymažete data webu; údaje úložiště relace jsou omezené na příslušnou
          relaci prohlížeče.
        </p>
        <p>
          Cookies a uložená data lze spravovat v nastavení prohlížeče.
          Zablokování nezbytných cookies může znemožnit přihlášení. Tento web
          nenabízí volbu marketingových ani analytických cookies, protože je
          nezavádí.
        </p>
        <h2 id="podminky">Podmínky používání</h2>
        <p>
          FlatBerry je nyní v testovacím provozu. Přístup a rozsah testování se
          domlouvají s provozovatelem. Informace o připravovaném bezplatném
          základu nejsou nabídkou placeného tarifu. Konečný ceník a podmínky
          služby zveřejníme před veřejným spuštěním.
        </p>
      </article>
    </main>
  );
}
