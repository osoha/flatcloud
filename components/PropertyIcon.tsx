import { Building2, House } from "lucide-react";
import { readPropertyTechnicalData } from "@/lib/property-technical";

function FloorPlan({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h18v18H3z"/><path d="M3 10h8v11M11 3v7M11 14h10"/><path d="M8 10v2"/></svg>;
}

export function PropertyIcon({ technicalData, unitCount, size = 18 }: { technicalData?: unknown; unitCount: number; size?: number }) {
  const type = readPropertyTechnicalData(technicalData as never).buildingType;
  if (type === "UNIT_ONLY") return <FloorPlan size={size}/>;
  if (type === "FAMILY_HOUSE") return <House size={size}/>;
  if (type === "APARTMENT_BUILDING" || type === "COMMERCIAL" || type === "MIXED") return <Building2 size={size}/>;
  return unitCount >= 4 ? <Building2 size={size}/> : <House size={size}/>;
}
