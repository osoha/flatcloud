import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Compass,
  ExternalLink,
  Headphones,
  Library,
  Search,
  Video,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import {
  methodologyChapters,
  methodologyGlossary,
  methodologyGuides,
  methodologyMediaBriefs,
  methodologySearchText,
} from "@/lib/methodology";

export const dynamic = "force-dynamic";
type MethodologyView = "guides" | "chapters" | "glossary" | "media";
const views = new Set<MethodologyView>([
  "guides",
  "chapters",
  "glossary",
  "media",
]);

export default async function MethodologyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const view: MethodologyView = views.has(query.view as MethodologyView)
    ? (query.view as MethodologyView)
    : "guides";
  const q = query.q || "";
  const needle = q.trim().toLocaleLowerCase("cs");
  const guides = methodologyGuides.filter(
    (guide) =>
      !needle ||
      `${guide.title} ${guide.situation} ${guide.audience} ${guide.outcome} ${guide.steps.map((step) => `${step.label} ${step.note}`).join(" ")}`
        .toLocaleLowerCase("cs")
        .includes(needle),
  );
  const chapters = methodologyChapters.filter(
    (chapter) =>
      !needle ||
      `${chapter.title} ${chapter.summary} ${chapter.category} ${chapter.audience} ${chapter.steps.join(" ")}`
        .toLocaleLowerCase("cs")
        .includes(needle),
  );
  const glossary = methodologyGlossary.filter(
    (term) =>
      !needle ||
      methodologySearchText(term).toLocaleLowerCase("cs").includes(needle),
  );
  const mediaBriefs = methodologyMediaBriefs.filter(
    (brief) =>
      !needle ||
      methodologySearchText(brief).toLocaleLowerCase("cs").includes(needle),
  );
  const categories = [
    ...new Set(methodologyChapters.map((chapter) => chapter.category)),
  ];
  const resultCount =
    view === "guides"
      ? guides.length
      : view === "chapters"
        ? chapters.length
        : view === "glossary"
          ? glossary.length
          : mediaBriefs.length;

  return (
    <Shell user={user}>
      <div className="page methodology-page">
        <div className="page-title">
          <div>
            <h1>Podpora práce</h1>
            <p>
              Průvodci podle životní situace, praktická metodika, jednotný
              slovník a interní znalostní osnovy.
            </p>
          </div>
        </div>
        <nav className="methodology-hub" aria-label="Rozcestník metodiky">
          <Hub
            href="/metodika?view=guides"
            active={view === "guides"}
            icon={<Compass size={22} />}
            title="Průvodci"
            note="Doporučená trasa podle situace"
          />
          <Hub
            href="/metodika?view=chapters"
            active={view === "chapters"}
            icon={<BookOpen size={22} />}
            title="Praktická metodika"
            note="Krokové návody podle agendy a role"
          />
          <Hub
            href="/metodika?view=glossary"
            active={view === "glossary"}
            icon={<Library size={22} />}
            title="Slovník a vzorce"
            note="Jednotné definice a přesné výpočty KPI"
          />
          <Hub
            href="/metodika?view=media"
            active={view === "media"}
            icon={<Headphones size={22} />}
            title="Znalostní média"
            note="Podcastové a video osnovy k odborné kontrole"
          />
        </nav>
        <form className="card methodology-search" method="get">
          <Search size={17} />
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={q}
            aria-label="Hledat v podpoře práce"
            placeholder="Hledat smlouvu, kauci, závěrku nebo prodej…"
          />
          <button className="secondary" type="submit">
            Hledat
          </button>
        </form>

        {view === "guides" && guides.length > 0 && (
          <section className="methodology-section">
            <div className="methodology-section-title">
              <Compass size={18} />
              <h2>Průvodci podle životní situace</h2>
            </div>
            <p className="methodology-section-copy">
              Každý průvodce skládá existující obrazovky do bezpečného
              pracovního pořadí. Kroky samy nic nezapisují ani automaticky
              nespouštějí.
            </p>
            <div className="methodology-guide-grid">
              {guides.map((guide) => (
                <article className="card methodology-guide" key={guide.slug}>
                  <div className="methodology-card-head">
                    <span>
                      {guide.situation} · {guide.audience}
                    </span>
                    <h3>{guide.title}</h3>
                    <p>{guide.outcome}</p>
                  </div>
                  <ol>
                    {guide.steps.map((step) => (
                      <li key={`${guide.slug}-${step.label}`}>
                        <Link href={step.href}>
                          <strong>{step.label}</strong>
                          <small>{step.note}</small>
                          <b aria-hidden="true">Otevřít →</b>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "chapters" &&
          chapters.length > 0 &&
          categories.map((category) => {
            const categoryChapters = chapters.filter(
              (chapter) => chapter.category === category,
            );
            if (!categoryChapters.length) return null;
            return (
              <section className="methodology-section" key={category}>
                <div className="methodology-section-title">
                  <BookOpen size={18} />
                  <h2>{category}</h2>
                </div>
                <div className="methodology-grid">
                  {categoryChapters.map((chapter) => (
                    <article
                      className="card methodology-card"
                      id={chapter.slug}
                      key={chapter.slug}
                    >
                      <div className="methodology-card-head">
                        <span>{chapter.audience}</span>
                        <h3>{chapter.title}</h3>
                        <p>{chapter.summary}</p>
                      </div>
                      <ol>
                        {chapter.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      <div className="methodology-check">
                        <CheckCircle2 size={16} />
                        <span>
                          <strong>Kontrolní bod</strong>
                          {chapter.check}
                        </span>
                      </div>
                      {chapter.href && (
                        <Link className="secondary" href={chapter.href}>
                          Přejít do aplikace <ExternalLink size={14} />
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}

        {view === "glossary" && glossary.length > 0 && (
          <section className="methodology-section">
            <div className="methodology-section-title">
              <Library size={18} />
              <h2>Slovník pojmů a vzorců</h2>
            </div>
            <p className="methodology-section-copy">
              Jednotné významy pojmů používaných v aplikaci, reportech a
              rozhodovacích podkladech. Vzorce přesně odpovídají LIVE výpočtům
              portfolia.
            </p>
            <div className="methodology-glossary-grid">
              {glossary.map((term) => {
                const chapter = methodologyChapters.find(
                  (item) => item.slug === term.chapterSlug,
                );
                return (
                  <article className="card methodology-term" key={term.term}>
                    <h3>{term.term}</h3>
                    <p>{term.definition}</p>
                    {term.formula && (
                      <div className="methodology-formula">
                        <span>Vzorec v aplikaci</span>
                        <strong>{term.formula}</strong>
                      </div>
                    )}
                    <small>Také: {term.aliases.join(", ")}</small>
                    {chapter && (
                      <Link href={`/metodika?view=chapters#${chapter.slug}`}>
                        Související kapitola: {chapter.title}
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "media" && mediaBriefs.length > 0 && (
          <section className="methodology-section">
            <div className="methodology-section-title">
              <Headphones size={18} />
              <h2>Podcastové a video osnovy</h2>
            </div>
            <p className="methodology-section-copy">
              Interní redakční briefy připravené k odborné kontrole.{" "}
              {"Nejde o publikovaný ani automaticky distribuovaný obsah."}
            </p>
            <div className="methodology-media-grid">
              {mediaBriefs.map((brief) => {
                const chapter = methodologyChapters.find(
                  (item) => item.slug === brief.chapterSlug,
                );
                return (
                  <article
                    className="card methodology-media-card"
                    key={`${brief.kind}-${brief.title}`}
                  >
                    <div className="methodology-media-kind">
                      {brief.kind === "Video" ? (
                        <Video size={15} />
                      ) : (
                        <Headphones size={15} />
                      )}
                      <span>
                        {brief.kind} · {brief.duration}
                      </span>
                    </div>
                    <h3>{brief.title}</h3>
                    <p>{brief.purpose}</p>
                    <ol>
                      {brief.outline.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                    {chapter && (
                      <Link href={`/metodika?view=chapters#${chapter.slug}`}>
                        Navazuje na: {chapter.title}
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {resultCount === 0 && (
          <div className="card empty-state">
            <h2>Žádný obsah neodpovídá hledání</h2>
            <p>Zkuste kratší pojem nebo zobrazte celý vybraný oddíl.</p>
            <Link className="secondary" href={`/metodika?view=${view}`}>
              Zobrazit vše
            </Link>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Hub({
  href,
  active,
  icon,
  title,
  note,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <Link
      className={`card methodology-hub-card ${active ? "active" : ""}`}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
    </Link>
  );
}
