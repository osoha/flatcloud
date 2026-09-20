import { PageHeading } from "@/components/PageHeading";
import { notFound } from "next/navigation";
import Link from "next/link";
import { actualToolAdmin } from "@/lib/admin-tools";
import { Shell } from "@/components/Shell";
import { Compass, House } from "lucide-react";
export default async function SkillsPage() {
  const user = await actualToolAdmin(); if (!user) notFound();
  return <Shell user={user}><div className="page"><div className="page-title"><div><PageHeading>Dovednosti</PageHeading><p>Soukromé nástroje hlavního administrátora.</p></div></div><section className="card"><h2><House size={22} aria-hidden="true"/> Avatary domů</h2><p>Vyberte skutečný 3D pohled na dům, upravte kompozici a stáhněte čtvercový podklad pro další práci.</p><Link className="primary" href="/dovednosti/avatary-domu">Otevřít Avatary domů</Link></section></div></Shell>;
}
