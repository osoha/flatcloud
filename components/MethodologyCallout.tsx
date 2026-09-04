import Link from "next/link";
import { BookOpen } from "lucide-react";
import { methodologyChapter } from "@/lib/methodology";

export function MethodologyCallout({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const chapter = methodologyChapter(slug);
  if (!chapter) return null;
  return <aside className={`methodology-callout${compact ? " compact" : ""}`}>
    <span className="methodology-callout-icon"><BookOpen size={18}/></span>
    <div><strong>{chapter.title}</strong><p>{chapter.summary}</p></div>
    <Link href={`/metodika#${chapter.slug}`}>Otevřít metodiku →</Link>
  </aside>;
}
