import type { Metadata } from "next";
import {
  House,
  Wallet,
  ListChecks,
  Calculator,
  ChartNoAxesCombined,
  Users,
} from "lucide-react";
import s from "./landing.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "FlatBerry — Vaše nemovitosti pod kontrolou",
  description:
    "Profesionální správa nájmů, plateb, smluv a úkolů. Jasný přehled pro správce, investory i vlastníky.",
};
const faq = [
  [
    "Pro koho je FlatBerry?",
    "Pro profesionální správce, investory i vlastníky, kteří chtějí mít přehled o nemovitostech. Propojuje smlouvy, platby, náklady a týmovou práci v jednom prostředí.",
  ],
  [
    "Je FlatBerry zdarma?",
    "Pro testery je nyní používání otevřené bez limitu jednotek. Připravovaný bezplatný základ počítá se 3 bytovými jednotkami. Podrobnosti placených tarifů představíme později.",
  ],
  [
    "Co znamenají 3 bytové jednotky?",
    "Počítají se jednotlivé byty. Dům se šesti samostatnými byty představuje šest jednotek. Během současného testování se tento limit neuplatňuje na testery.",
  ],
  [
    "Co mě čeká po registraci?",
    "Po potvrzení e-mailu vám Berry pomůže vybrat vzhled a provede vás krátkou prohlídkou podle zvoleného režimu. Průvodce můžete odložit, ukončit nebo znovu spustit v Mém účtu.",
  ],
  [
    "Musím něco instalovat?",
    "Ne. FlatBerry používáte ve webovém prohlížeči na počítači nebo mobilu.",
  ],
  [
    "Můžu spolupracovat s kolegy nebo vlastníky?",
    "Ano. Můžete přizvat spolupracovníky a nastavit jejich oprávnění. Úkoly, diskuse a podklady jsou dostupné podle přiděleného přístupu.",
  ],
  [
    "Umí FlatBerry pracovat s bankovními platbami?",
    "Ano, prostřednictvím podporovaných oznámení a importů. Konkrétní možnosti závisejí na zdroji a nastavení; nejde o univerzální přímé napojení všech bank.",
  ],
  [
    "Pomůže mi s vyúčtováním služeb?",
    "Ano. Od podkladů a rozdělení nákladů přes protokoly až po evidenci doručení, námitek a vypořádání. Evidence doručení sama neznamená odeslání dokumentu.",
  ],
  [
    "Můžu převést údaje z Excelu?",
    "Podporované údaje připravíte v předepsané CSV struktuře a ověříte v náhledu importu. Libovolný excelový soubor nelze automaticky převést bez přípravy.",
  ],
  [
    "Kde najdu pomoc a návody?",
    "Přímo v aplikaci najdete metodiku a praktické průvodce. Veřejný blog, tipy a vzory smluv připravujeme. S první orientací vám pomůže také průvodce Berry.",
  ],
];
const features = [
  [
    House,
    "Nájmy a smlouvy",
    "Nájemníci, obsazenost, dokumenty a blížící se konce smluv.",
  ],
  [
    Wallet,
    "Platby a náklady",
    "Přijaté platby, nedoplatky a výdaje přiřazené k domům a jednotkám.",
  ],
  [
    ListChecks,
    "Úkoly a termíny",
    "Odpovědnost, revize a komunikace v souvislostech konkrétního případu.",
  ],
  [
    Calculator,
    "Vyúčtování služeb",
    "Podklady, rozdělení nákladů, protokol a přehled následného vypořádání.",
  ],
  [
    ChartNoAxesCombined,
    "Reporty a scénáře",
    "Výsledky portfolia a scénáře budoucího vývoje nájemného.",
  ],
  [
    Users,
    "Tým a spolupráce",
    "Sdílená práce s nastavenými přístupy a praktickou metodikou po ruce.",
  ],
] as const;
const nav = [
  ["Funkce", "funkce"],
  ["Pro koho", "pro-koho"],
  ["Jak začít", "jak-zacit"],
  ["Zdarma", "zdarma"],
  ["FAQ", "faq"],
];
function Logo() {
  return (
    <img
      src="/landing/logo.webp"
      alt="Flatberry"
      width="220"
      height="41"
      className={s.logo}
    />
  );
}
export default function Page() {
  const signup =
    process.env.PUBLIC_REGISTRATION_ENABLED === "true"
      ? "/registrace"
      : "mailto:info@flatcloud.cz?subject=Chci%20vyzkou%C5%A1et%20FlatBerry";
  const cta = (label = "Vyzkoušet zdarma") => (
    <a className={s.primary} href={signup}>
      {label}
    </a>
  );
  return (
    <div className={s.landing}>
      <a className={s.skip} href="#obsah">
        Přejít na obsah
      </a>
      <header className={s.header}>
        <a href="#" aria-label="Flatberry — úvod">
          <Logo />
        </a>
        <nav aria-label="Hlavní navigace">
          {nav.map(([label, id]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
        </nav>
        <div className={s.account}>
          <a href="/login">Přihlásit se</a>
          {cta()}
        </div>
        <details className={s.mobileNav}>
          <summary>Menu</summary>
          <nav aria-label="Mobilní navigace">
            {nav.map(([label, id]) => (
              <a key={id} href={"#" + id}>
                {label}
              </a>
            ))}
            <a href="/login">Přihlásit se</a>
          </nav>
        </details>
      </header>
      <main id="obsah">
        <section className={s.hero}>
          <div className={s.heroPhoto} />
          <div className={s.heroCopy}>
            <span className={s.eyebrow}>
              SPRÁVA PRONÁJMŮ A PŘEHLED PORTFOLIA
            </span>
            <h1>
              Profesionální správa.
              <br /> Jasný přehled o nemovitostech.
            </h1>
            <p>
              Nájmy, platby, náklady a týmová práce v souvislostech celého
              portfolia.
            </p>
            <p className={s.heroSub}>
              Pro správce, kteří řeší provoz, i investory, kteří potřebují
              podklady pro rozhodování.
            </p>
            <div className={s.actions}>
              {cta()}
              <a className={s.secondary} href="#nahledy">
                Prohlédnout aplikaci
              </a>
            </div>
          </div>
          <div className={s.heroScreen}>
            <div className={s.screenBar}>
              <span />
              <span />
              <span />
              <small>FlatBerry</small>
            </div>
            <img
              src="/landing/app-detail.webp"
              alt="Přehled domu U Lip v aplikaci FlatBerry: nájmy, platby, 8 smluv a 3 úkoly"
              width="1333"
              height="926"
              fetchPriority="high"
            />
          </div>
        </section>
        <div className={s.compact}>
          <section id="pro-koho" className={`${s.section} ${s.perspectives}`}>
            <span className={s.eyebrow}>DVĚ PERSPEKTIVY. JEDNA APLIKACE.</span>
            <div className={s.dualHeading}>
              <div>
                <h2>
                  Jednoduché
                  <br /> pro vlastníky
                </h2>
                <p>
                  Víte, co přišlo, co se řeší a kdy je potřeba vaše rozhodnutí.
                </p>
              </div>
              <span className={s.slash} aria-hidden="true">
                /
              </span>
              <div>
                <h2>
                  Propracované
                  <br /> pro správce
                </h2>
                <p>
                  Platby, náklady, smlouvy a týmové úkoly v souvislostech celého
                  portfolia.
                </p>
              </div>
            </div>
            <picture className={s.perspectiveImage}>
              <source
                media="(min-width: 901px)"
                srcSet="/landing/two-perspectives-full.webp"
              />
              <img
                src="/landing/two-perspectives.webp"
                alt="Berry s přehledem na mobilu a profesionální správce s aplikací na notebooku"
                width="1536"
                height="500"
                loading="lazy"
              />
            </picture>
            <h3>Přehled pro vlastníka. Nástroje pro správce.</h3>
            <a className={s.primary} href="#nahledy">
              Prohlédnout FlatBerry →
            </a>
          </section>
          <section id="funkce" className={`${s.section} ${s.features}`}>
            <div className={s.center}>
              <span className={s.eyebrow}>CO VÁM FLATBERRY USNADNÍ</span>
              <h2>
                Víte, co se děje.
                <br /> A co je potřeba udělat.
              </h2>
              <p>
                Každodenní provoz a dlouhodobá rozhodnutí.
                <br /> Důležité informace propojené s nemovitostí,
                <br /> ke které patří.
              </p>
            </div>
            <div className={s.featureGrid}>
              {features.map(([Icon, title, body]) => (
                <article key={title}>
                  <div className={s.icon}>
                    <Icon size={25} strokeWidth={1.6} />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>
          <section id="nahledy" className={`${s.section} ${s.gallery}`}>
            <div className={s.center}>
              <span className={s.eyebrow}>PODÍVEJTE SE DOVNITŘ</span>
              <h2>Od každodenní správy k rozhodování.</h2>
              <p>Vše podstatné k nemovitostem najdete na jednom místě.</p>
            </div>
            {(
              [
                [
                  "portfolio",
                  "01 / PLATBY A NÁKLADY",
                  <>
                    Platby a stav objektů
                    <br /> v jednom přehledu.
                  </>,
                  <>
                    Předpisy, dluhy a inkaso u nemovitostí.
                    <br /> Rychle poznáte, co je v pořádku
                    <br /> a čemu je potřeba věnovat pozornost.
                  </>,
                  "Od portfolia k jednotlivým objektům",
                  "Platby a stav objektů v jednom přehledu.",
                  904,
                  445,
                ],
                [
                  "tasks",
                  "02 / TÝMOVÁ PRÁCE",
                  <>
                    Každý ví,
                    <br /> co má řešit.
                  </>,
                  <>
                    Sledujte stav úkolů, odpovědnost
                    <br /> i priority na jednom místě.
                    <br /> Otevřete případ a pokračujte v řešení.
                  </>,
                  "Méně dohledávání v e-mailech",
                  "Každý ví, co má řešit.",
                  1014,
                  390,
                ],
                [
                  "reports",
                  "03 / REPORTY A PORTFOLIO",
                  <>
                    Podklady pro vaše
                    <br /> další rozhodnutí.
                  </>,
                  <>
                    Sledujte inkaso, dluhy a výsledky.
                    <br /> Od jednotlivých nemovitostí
                    <br /> až po souhrnný pohled na portfolio.
                  </>,
                  "",
                  "Podklady pro vaše další rozhodnutí.",
                  1014,
                  407,
                ],
              ] as const
            ).map(([file, n, title, body, a, b, w, h]) => (
              <article className={s.galleryRow} key={file}>
                <div className={s.galleryText}>
                  <span className={s.number}>{n}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  {a && <span className={s.pill}>{a}</span>}
                </div>
                <a
                  className={s.galleryImage}
                  href={"/landing/app-" + file + ".webp"}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={"Zvětšit náhled: " + b}
                >
                  <div className={s.screenBar}>
                    <span />
                    <span />
                    <span />
                    <small>FlatBerry</small>
                  </div>
                  <img
                    src={"/landing/app-" + file + ".webp"}
                    alt={String(b)}
                    width={Number(w)}
                    height={Number(h)}
                    loading="lazy"
                  />
                </a>
              </article>
            ))}
          </section>
          <section id="jak-zacit" className={`${s.section} ${s.guide}`}>
            <div>
              <span className={s.eyebrow}>SROZUMITELNÝ ZAČÁTEK</span>
              <h2>
                Seznamte se.
                <br /> Bernard. Pro vás Berry.
              </h2>
              <p>
                Váš průvodce prvními kroky.
                <br /> Začněte jednoduše a vlastním tempem.
              </p>
              <div className={s.berry}>
                <img
                  src="/landing/berry-guide.webp"
                  alt="Berry ukazuje seznam prvních kroků"
                  width="330"
                  height="400"
                  loading="lazy"
                />
                <blockquote>
                  „Projdeme to spolu.
                  <br /> Krok za krokem.“
                </blockquote>
              </div>
            </div>
            <div className={s.steps}>
              {[
                ["Vytvořte účet", "Potvrďte svůj e-mail a přihlaste se."],
                [
                  "Rozhlédněte se s Berrym",
                  "Krátký průvodce vám ukáže, kde co najdete.",
                ],
                [
                  "Přidejte první nemovitost",
                  "Domy, jednotky a nájmy doplníte postupně.",
                ],
              ].map(([title, body], i) => (
                <article key={title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
              <p>Průvodce můžete odložit a kdykoliv znovu spustit.</p>
            </div>
          </section>
          <section id="zdarma" className={s.offer}>
            <div>
              <span className={s.eyebrow}>NYNÍ PRO TESTERY</span>
              <h2>
                Vyzkoušejte FlatBerry.
                <br /> Bez limitu jednotek.
              </h2>
              <p>
                Pro testery je nyní počet jednotek otevřený.
                <br /> Placené tarify představíme později.
              </p>
              {cta()}
            </div>
            <div className={s.free}>
              <span>PŘIPRAVOVANÝ ZÁKLAD</span>
              <strong>3 byty</strong>
              <b>zdarma</b>
              <p>
                Počítají se jednotlivé
                <br /> bytové jednotky, nikoli domy.
              </p>
            </div>
          </section>
          <section id="faq" className={`${s.section} ${s.faq}`}>
            <div>
              <span className={s.eyebrow}>ČASTÉ OTÁZKY</span>
              <h2>Než začnete.</h2>
              <p>To nejdůležitější o používání FlatBerry.</p>
            </div>
            <div>
              {faq.map(([q, a]) => (
                <details key={q} open>
                  <summary>
                    {q}
                    <span aria-hidden="true" />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>
          <section className={`${s.section} ${s.resources}`}>
            <span className={s.eyebrow}>DALŠÍ POMOCNÍKY PŘIPRAVUJEME</span>
            <div>
              {[
                ["Blog", "Články z praxe správy nemovitostí."],
                ["Tipy", "Drobnosti, které usnadní práci."],
                ["Vzory smluv", "Materiály pro každodenní agendu."],
              ].map(([title, body]) => (
                <button type="button" key={title} disabled>
                  <span>
                    <b>{title}</b>
                    <small>Připravujeme</small>
                  </span>
                  <p>{body}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
        <section className={s.closing}>
          <div>
            <span className={s.eyebrow}>VAŠE NEMOVITOSTI. VÁŠ PŘEHLED.</span>
            <h2>Méně dohledávání. Více přehledu.</h2>
            <p>
              Dejte každodenní správě řád a mějte své portfolio v souvislostech.
            </p>
            {cta()}
            <a className={s.textLink} href="/login">
              Už máte účet? Přihlaste se.
            </a>
          </div>
        </section>
      </main>
      <footer id="kontakt" className={s.footer}>
        <div className={s.footerTop}>
          <div>
            <a href="#" aria-label="Flatberry — úvod">
              <Logo />
            </a>
            <p>
              Správa pronájmů a přehled portfolia.
              <br /> Pro správce, investory a vlastníky.
            </p>
            <a className={s.textLink} href="mailto:info@flatcloud.cz">
              info@flatcloud.cz
            </a>
            <p className={s.footerClaim}>Vaše nemovitosti pod kontrolou.</p>
          </div>
          <nav aria-label="Navigace v patičce">
            <span className={s.eyebrow}>FLATBERRY</span>
            {nav.map(([label, id]) => (
              <a key={id} href={"#" + id}>
                {label}
              </a>
            ))}
          </nav>
          <div>
            <span className={s.eyebrow}>KONTAKT A PROVOZOVATEL</span>
            <h3>Flat Cloud a.s.</h3>
            <address>
              Houškova 561/4, Východní Předměstí
              <br /> 326 00 Plzeň
              <br /> IČO: 23111780
            </address>
            <p>
              Krajský soud v Plzni
              <br /> oddíl B, vložka 2257
            </p>
          </div>
        </div>
        <div className={s.footerBottom}>
          <span>© {new Date().getFullYear()} FlatBerry · Flat Cloud a.s.</span>
          <a href="/pravni-informace#osobni-udaje">Ochrana osobních údajů</a>
          <a href="/pravni-informace#cookies">Informace o cookies</a>
          <a href="/pravni-informace#cookies">Nastavení cookies</a>
          <a href="/pravni-informace#podminky">Podmínky používání</a>
        </div>
      </footer>
    </div>
  );
}
