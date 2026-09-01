import type { ReactNode } from "react";
import type { QuarterlyPropertyNavItem, QuarterlyQualityGateView } from "./types";

const completionLabels = {
  "required-incomplete": "Povinné údaje neúplné",
  "editorial-sparse": "Volitelný obsah je řídký",
  complete: "Kompletní",
} as const;

export function QuarterlyReportQuarterOverview({ year, quarter, groupName, revision, statusLabel, properties, quality, executiveSummaryEditor, template, activeTemplates, editable, templateAction }: { year: number; quarter: number; groupName: string; revision: number; statusLabel: string; properties: QuarterlyPropertyNavItem[]; quality: QuarterlyQualityGateView; executiveSummaryEditor: ReactNode; template: { name: string; version: number } | null; activeTemplates: Array<{ id: string; name: string; version: number }>; editable: boolean; templateAction: string }) {
  return <div className="quarterly-workspace-content">
    <div className="card quarterly-internal-overview"><div className="card-head"><div><span className="quarterly-eyebrow">Interní přehled přípravy</span><h2>Přehled kvartálu</h2><p className="muted-copy">Koordinace reportů jednotlivých nemovitostí. Nejde o investor-facing portfolio souhrn.</p></div></div>
      <div className="quarterly-overview-stats"><div><span>Období</span><strong>{year} Q{quarter}</strong></div><div><span>Reportovací skupina</span><strong>{groupName}</strong></div><div><span>Revize</span><strong>{revision}</strong></div><div><span>Stav</span><strong>{statusLabel}</strong></div><div><span>Nemovitosti</span><strong>{properties.length}</strong></div><div><span>Kvalita</span><strong>W {quality.warningCount} · B {quality.blockerCount}</strong></div></div>
    </div>
    <div className="card"><span className="quarterly-eyebrow">Přesná verze pro reprodukovatelnost</span><h2>Šablona reportu</h2><p><strong>{template ? `${template.name} · v${template.version}` : "Legacy / bez přiřazené šablony"}</strong></p>{editable && <form className="compact-form" action={templateAction} method="post"><label className="field"><span>Aktivní šablona</span><select name="designTemplateVersionId" defaultValue=""><option value="" disabled>Vyberte aktivní verzi</option>{activeTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label><button className="secondary" type="submit" name="action" value="assign">Přiřadit šablonu</button>{!template && <button className="primary" type="submit" name="action" value="use-default">Použít výchozí FlatCloud šablonu</button>}</form>}</div>
    <div className="card"><h2>Stav nemovitostí</h2><div className="quarterly-completion-list">{properties.map((property) => <div key={property.propertyId}><div><strong>{property.propertyName}</strong><small>{completionLabels[property.completion]}</small></div><span>{property.warningCount > 0 ? `WARNING ${property.warningCount}` : ""}{property.blockerCount > 0 ? ` BLOCKER ${property.blockerCount}` : ""}</span></div>)}</div></div>
    <div className="card quarterly-internal-summary"><h2>Interní shrnutí reportovacího období</h2><p className="muted-copy">Stávající pole je zachováno kvůli kompatibilitě. Není koncipováno jako titulní portfolio příběh kvartálních reportů.</p>{executiveSummaryEditor}</div>
  </div>;
}
