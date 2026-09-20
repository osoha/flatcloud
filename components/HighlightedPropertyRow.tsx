import type { CSSProperties, ReactNode } from "react";
import { NavigableTableRow } from "@/components/NavigableTableRow";
import { FavoriteProperty } from "@/components/FavoriteProperty";
import { appearanceBackgrounds, type AppearanceColor } from "@/lib/entity-appearance-values";

export function HighlightedPropertyRow({ propertyId, name, href, children, className = "", color = "", favorite = false }: { propertyId: string; name: string; href: string; children: ReactNode; className?: string; color?: AppearanceColor; favorite?: boolean }) {
  return <NavigableTableRow href={href} ariaLabel={`Otevřít nemovitost ${name}`} className={`highlighted-property-row ${className}`} style={{ "--row-highlight": appearanceBackgrounds[color] } as CSSProperties}>
    {children}<td><FavoriteProperty propertyId={propertyId} name={name} favorite={favorite}/></td>
  </NavigableTableRow>;
}
