import Link from "next/link";
import { BookOpen, CheckCircle2, ExternalLink, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { methodologyChapters } from "@/lib/methodology";

export const dynamic = "force-dynamic";

export default async function MethodologyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const needle = q.trim().toLocaleLowerCase("cs");
  const chapters = methodologyChapters.filter((chapter) => !needle || `${chapter.title} ${chapter.summary} ${chapter.category} ${chapter.audience} ${chapter.steps.join(" ")}`.toLocaleLowerCase("cs").includes(needle));
  const categories = [...new Set(methodologyChapters.map((chapter) => chapter.category))];
  return <Shell user={user}><div className="page methodology-page">
    <div className="page-title"><div><h1>Metodika správy</h1><p>Praktické postupy FlatCloud propojené s konkrétními úkoly v aplikaci.</p></div></div>
    <form className="card methodology-search" method="get"><Search size={17}/><input name="q" defaultValue={q} aria-label="Hledat v metodice" placeholder="Hledat smlouvu, kauci, valorizaci nebo revizi…"/><button className="secondary" type="submit">Hledat</button></form>
    {!needle&&<nav className="methodology-categories" aria-label="Kategorie metodiky">{categories.map((category)=><a href={`#category-${category.replaceAll(" ", "-").toLocaleLowerCase("cs")}`} key={category}>{category}</a>)}</nav>}
    {chapters.length ? categories.map((category)=>{
      const categoryChapters=chapters.filter((chapter)=>chapter.category===category);
      if(!categoryChapters.length)return null;
      return <section className="methodology-section" id={`category-${category.replaceAll(" ", "-").toLocaleLowerCase("cs")}`} key={category}><div className="methodology-section-title"><BookOpen size={18}/><h2>{category}</h2></div><div className="methodology-grid">{categoryChapters.map((chapter)=><article className="card methodology-card" id={chapter.slug} key={chapter.slug}><div className="methodology-card-head"><span>{chapter.audience}</span><h3>{chapter.title}</h3><p>{chapter.summary}</p></div><ol>{chapter.steps.map((step)=><li key={step}>{step}</li>)}</ol><div className="methodology-check"><CheckCircle2 size={16}/><span><strong>Kontrolní bod</strong>{chapter.check}</span></div>{chapter.href&&<Link className="secondary" href={chapter.href}>Přejít do aplikace <ExternalLink size={14}/></Link>}</article>)}</div></section>;
    }):<div className="card empty-state"><h2>Žádná metodika neodpovídá hledání</h2><p>Zkuste kratší pojem nebo zobrazte všechny kapitoly.</p><Link className="secondary" href="/metodika">Zobrazit vše</Link></div>}
  </div></Shell>;
}
