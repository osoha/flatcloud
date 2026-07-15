import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appSettings, syncIntervalHours } from "@/lib/settings";
import { Shell } from "@/components/Shell";
import { Flash } from "@/components/FormUi";

export const dynamic = "force-dynamic";

const options = [1, 2, 3, 4, 6, 8, 12, 24];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/portfolio");
  const [settings, query] = await Promise.all([appSettings(), searchParams]);
  return <Shell user={user}><div className="page"><div className="page-title"><div><h1>Administrace aplikace</h1><p>Globální nastavení automatického načítání bankovních transakcí.</p></div></div><Flash ok={query.ok} error={query.error}/><div className="detail-grid"><form className="card col-7 edit-form" action="/api/settings/banking" method="post"><h2>Automatická synchronizace bank</h2><p className="muted-copy">Render spouští kontrolní úlohu jednou za hodinu. Aplikace podle nastavené frekvence rozhodne, které účty jsou právě ke stažení.</p><div className="form-grid" style={{ marginTop: 18 }}><label className="checkbox-field field-full"><input type="checkbox" name="automaticBankSync" defaultChecked={settings.automaticBankSync}/><span>Automatické stahování plateb je aktivní</span></label><label className="field field-full"><span>Počet synchronizací za den</span><select name="bankSyncsPerDay" defaultValue={settings.bankSyncsPerDay}>{options.map((value) => <option value={value} key={value}>{value}× denně {value === 24 ? "(každou hodinu)" : `(přibližně každých ${syncIntervalHours(value)} h)`}</option>)}</select></label></div><div className="form-actions"><button className="primary" type="submit">Uložit nastavení</button></div></form><div className="card col-5"><h2>Stav plánovače</h2><div className="summary-list"><div><span>Poslední start</span><strong>{settings.lastCronStartedAt ? settings.lastCronStartedAt.toLocaleString("cs-CZ") : "Zatím neběžel"}</strong></div><div><span>Poslední dokončení</span><strong>{settings.lastCronFinishedAt ? settings.lastCronFinishedAt.toLocaleString("cs-CZ") : "—"}</strong></div><div><span>Výsledek</span><strong>{settings.lastCronSummary || "—"}</strong></div></div><div className="notice" style={{ marginTop: 16 }}>U jednotlivého bankovního účtu lze automatickou synchronizaci samostatně vypnout.</div></div></div></div></Shell>;
}
