import Link from "next/link";
import type { QuarterlyPropertyNavItem } from "./types";

const completionLabels = {
  "required-incomplete": "Chybí povinný stav",
  "editorial-sparse": "Řídký obsah",
  complete: "Kompletní",
} as const;

export function QuarterlyReportWorkspaceNav({ baseHref, activeSection, activePropertyId, properties }: { baseHref: string; activeSection: "overview" | "property" | "review"; activePropertyId?: string; properties: QuarterlyPropertyNavItem[] }) {
  return <nav className="quarterly-workspace-nav" aria-label="Příprava kvartálního reportu">
    <Link className={activeSection === "overview" ? "active" : ""} href={`${baseHref}?section=overview`}><strong>Přehled kvartálu</strong><small>Interní koordinace období</small></Link>
    <div className="quarterly-nav-group"><span>Nemovitosti</span>{properties.map((property) => <Link className={activeSection === "property" && activePropertyId === property.propertyId ? "active" : ""} href={`${baseHref}?propertyId=${encodeURIComponent(property.propertyId)}`} key={property.propertyId}>
      <strong>{property.propertyName}</strong>
      <small className={`completion-${property.completion}`}>{completionLabels[property.completion]}</small>
      {(property.warningCount > 0 || property.blockerCount > 0) && <span className="quarterly-quality-pills">{property.warningCount > 0 && <i className="warning">W {property.warningCount}</i>}{property.blockerCount > 0 && <i className="blocker">B {property.blockerCount}</i>}</span>}
    </Link>)}</div>
    <Link className={activeSection === "review" ? "active" : ""} href={`${baseHref}?section=review`}><strong>Kontrola a export</strong><small>Úplnost, kvalita a workflow</small></Link>
  </nav>;
}
