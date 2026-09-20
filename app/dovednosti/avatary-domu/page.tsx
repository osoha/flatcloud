import { PageHeading } from "@/components/PageHeading";
import { notFound } from "next/navigation";
import { actualToolAdmin } from "@/lib/admin-tools";
import { Shell } from "@/components/Shell";
import { House } from "lucide-react";
export default async function HouseAvatarsPage() {
  const user = await actualToolAdmin(); if (!user) notFound();
  return <Shell user={user}><div className="page"><div className="page-title"><div><PageHeading>Avatary domů</PageHeading><p>Váš mapový klíč a výběr pohledu jsou soukromé. Obrázky se nikam automaticky nepublikují.</p></div><a href="/dovednosti">Všechny dovednosti</a></div><iframe title="Výběr 3D pohledu a výřezu domu" src="/dovednosti/avatary-domu/nastroj" allow="display-capture" style={{width:"100%",height:"min(1500px, 180vh)",minHeight:1000,border:0,background:"transparent"}}/></div></Shell>;
}
