import s from "../landing.module.css";
export const metadata = { title: "Právní informace | FlatBerry" };
export default function LegalPage() {
  return (
    <main className={s.landing}>
      <article className={s.legal}>
        <a href="/">← Zpět na FlatBerry</a>
        <h1>Právní informace</h1>
        <p>
          Tato stránka je součástí testovacího prostředí FlatBerry. Úplné
          podmínky služby a informace o zpracování údajů v aplikaci budou
          doplněny před veřejným spuštěním.
        </p>
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
          Na úvodní stránce nevyplňujete žádný kontaktní formulář. Kontakt
          otevře váš e-mailový program. Pokud nám napíšete, obdržíme vaši
          e-mailovou adresu a údaje, které sami uvedete ve zprávě, abychom mohli
          odpovědět na váš požadavek.
        </p>
        <p>
          Dotazy k osobním údajům a žádosti o přístup, opravu či výmaz směřujte
          na <a href="mailto:info@flatcloud.cz">info@flatcloud.cz</a>. Tento
          stručný přehled se týká úvodní stránky; nenahrazuje úplné informace o
          zpracování údajů při používání aplikace.
        </p>
        <h2 id="cookies">Informace o cookies</h2>
        <p>
          Tento onepager nepřidává analytické ani reklamní cookies a nenačítá
          reklamní či analytické skripty. Obrázky a písma jsou poskytovány přímo
          s webem. Přihlašovací a další nezbytné mechanismy aplikace fungují
          samostatně.
        </p>
        <p>
          Na této stránce proto není volba marketingových či analytických
          cookies. Již uložené cookies můžete spravovat v nastavení svého
          prohlížeče.
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
