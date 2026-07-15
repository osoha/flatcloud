import Link from "next/link";

const sections = [
  ["prehled", "Přehled"], ["jednotky", "Jednotky"], ["najemnici", "Nájemníci"],
  ["smlouvy", "Smlouvy"], ["predpisy", "Předpisy"], ["platby", "Platby"],
  ["dluznici", "Dlužníci"], ["banka", "Bankovní účet"], ["nastaveni", "Nastavení"],
];

export function PropertySubnav({ propertyId, active }: { propertyId: string; active: string }) {
  return <nav className="section-nav">{sections.map(([slug,label])=><Link className={active===slug?"active":""} key={slug} href={`/nemovitosti/${propertyId}/${slug}`}>{label}</Link>)}</nav>;
}
