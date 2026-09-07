import Link from "next/link";
import { BookOpen, CheckCircle2, ExternalLink, Headphones, Library, Search, Video } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { methodologyChapters, methodologyGlossary, methodologyMediaBriefs, methodologySearchText } from "@/lib/methodology";

export const dynamic = "force-dynamic";

export default async function MethodologyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const needle = q.trim().toLocaleLowerCase("cs");
  const chapters = methodologyChapters.filter((chapter) => !needle || `${chapter.title} ${chapter.summary} ${chapter.category} ${chapter.audience} ${chapter.steps.join(" ")}`.toLocaleLowerCase("cs").includes(needle));
  const glossary = methodologyGlossary.filter((term) => !needle || methodologySearchText(term).toLocaleLowerCase("cs").includes(needle));
  const mediaBriefs = methodologyMediaBriefs.filter((brief) => !needle || methodologySearchText(brief).toLocaleLowerCase("cs").includes(needle));
  const categories = [...new Set(methodologyChapters.map((chapter) => chapter.category))];
  return <Shell user={user}><div className="page methodology-page">
    <div className="page-title"><div><h1>Metodika správy</h1><p>Praktické postupy FlatCloud propojené s konkrétními úkoly v aplikaci.</p></div></div>
    {!needle&&<nav className="methodology-hub" aria-label="Rozcestník metodiky">
      <a className="card methodology-hub-card" href="#postupy"><BookOpen size={22}/><span><strong>Praktické postupy</strong><small>Krokové návody podle agendy a role</small></span></a>
      <a className="card methodology-hub-card" href="#slovnik"><Library size={22}/><span><strong>Slovník a vzorce</strong><small>Jednotné definice a přesné výpočty KPI</small></span></a>
      <a className="card methodology-hub-card" href="#medialni-osnovy"><Headphones size={22}/><span><strong>Znalostní média</strong><small>Podcastové a video osnovy k odborné kontrole</small></span></a>
    </nav>}
    <form className="card methodology-search" method="get"><Search size={17}/><input name="q" defaultValue={q} aria-label="Hledat v metodice" placeholder="Hledat smlouvu, kauci, valorizaci nebo revizi…"/><button className="secondary" type="submit">Hledat</button></form>
    {!needle&&<nav className="methodology-categories" aria-label="Kategorie metodiky">{categories.map((category)=><a href={`#category-${category.replaceAll(" ", "-").toLocaleLowerCase("cs")}`} key={category}>{category}</a>)}<a href="#slovnik">Slovník</a><a href="#medialni-osnovy">Mediální osnovy</a></nav>}
    <div id="postupy" className="methodology-anchor" />
    {chapters.length ? categories.map((category)=>{
      const categoryChapters=chapters.filter((chapter)=>chapter.category===category);
      if(!categoryChapters.length)return null;
      return <section className="methodology-section" id={`category-${category.replaceAll(" ", "-").toLocaleLowerCase("cs")}`} key={category}><div className="methodology-section-title"><BookOpen size={18}/><h2>{category}</h2></div><div className="methodology-grid">{categoryChapters.map((chapter)=><article className="card methodology-card" id={chapter.slug} key={chapter.slug}><div className="methodology-card-head"><span>{chapter.audience}</span><h3>{chapter.title}</h3><p>{chapter.summary}</p></div><ol>{chapter.steps.map((step)=><li key={step}>{step}</li>)}</ol><div className="methodology-check"><CheckCircle2 size={16}/><span><strong>Kontrolní bod</strong>{chapter.check}</span></div>{chapter.href&&<Link className="secondary" href={chapter.href}>Přejít do aplikace <ExternalLink size={14}/></Link>}</article>)}</div></section>;
    }):null}
    {glossary.length>0&&<section className="methodology-section" id="slovnik"><div className="methodology-section-title"><Library size={18}/><h2>Slovník pojmů a vzorců</h2></div><p className="methodology-section-copy">Jednotné významy pojmů používaných v aplikaci, reportech a rozhodovacích podkladech. Vzorce přesně odpovídají LIVE výpočtům portfolia.</p><div className="methodology-glossary-grid">{glossary.map((term)=>{const chapter=methodologyChapters.find((item)=>item.slug===term.chapterSlug);return <article className="card methodology-term" key={term.term}><h3>{term.term}</h3><p>{term.definition}</p>{term.formula&&<div className="methodology-formula"><span>Vzorec v aplikaci</span><strong>{term.formula}</strong></div>}<small>Také: {term.aliases.join(", ")}</small>{chapter&&<Link href={`/metodika#${chapter.slug}`}>Související kapitola: {chapter.title}</Link>}</article>})}</div></section>}
    {mediaBriefs.length>0&&<section className="methodology-section" id="medialni-osnovy"><div className="methodology-section-title"><Headphones size={18}/><h2>Podcastové a video osnovy</h2></div><p className="methodology-section-copy">Interní redakční briefy připravené k odborné kontrole. Nejde o publikovaný ani automaticky distribuovaný obsah.</p><div className="methodology-media-grid">{mediaBriefs.map((brief)=>{const chapter=methodologyChapters.find((item)=>item.slug===brief.chapterSlug);return <article className="card methodology-media-card" key={`${brief.kind}-${brief.title}`}><div className="methodology-media-kind">{brief.kind==="Video"?<Video size={15}/>:<Headphones size={15}/>}<span>{brief.kind} · {brief.duration}</span></div><h3>{brief.title}</h3><p>{brief.purpose}</p><ol>{brief.outline.map((item)=><li key={item}>{item}</li>)}</ol>{chapter&&<Link href={`/metodika#${chapter.slug}`}>Navazuje na: {chapter.title}</Link>}</article>})}</div></section>}
    {!chapters.length&&!glossary.length&&!mediaBriefs.length&&<div className="card empty-state"><h2>Žádná metodika neodpovídá hledání</h2><p>Zkuste kratší pojem nebo zobrazte všechny kapitoly.</p><Link className="secondary" href="/metodika">Zobrazit vše</Link></div>}
  </div></Shell>;
}
