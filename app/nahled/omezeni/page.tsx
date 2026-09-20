import { redirect } from "next/navigation";
import { actualUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
export default async function PreviewBoundary() {
  const actor = await actualUser();
  if (!actor) redirect("/login");
  return <Shell user={actor}><div className="page"><section className="card"><h1>Správa zůstává administrátorovi</h1><p>V náhledu můžete procházet obsah dostupný vybranému uživateli. Pro správu účtů, nastavení nebo Dovednosti nejprve ukončete náhled.</p><a href="/portfolio">Zpět do portfolia uživatele</a></section></div></Shell>;
}
