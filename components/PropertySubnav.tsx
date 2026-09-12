import Link from "next/link";

const fullSections = [
  ["prehled", "Přehled"],
  ["jednotky", "Jednotky"],
  ["najemnici", "Nájemníci"],
  ["smlouvy", "Smlouvy"],
  ["platby", "Platby"],
  ["finance", "Náklady a úvěry"],
  ["provoz", "Provoz"],
  ["banka", "Banka a pravidla"],
  ["technicke-udaje", "Technické údaje"],
  ["dokumenty", "Dokumenty"],
  ["reporting", "Reporty"],
  ["nastaveni", "Nastavení"],
];
const unitSections = [["prehled","Přehled"],["jednotky","Moje jednotky"],["najemnici","Nájemníci"],["smlouvy","Smlouvy"],["platby","Platby"],["dluznici","Saldo"],["banka","Bankovní účet"],["dokumenty","Dokumenty"]];

export function PropertySubnav({ propertyId, active, unitLimited=false }: { propertyId: string; active: string; unitLimited?: boolean }) {
  const sections=unitLimited?unitSections:fullSections;
  return <nav className="section-nav v21-section-nav">{sections.map(([slug,label])=><Link className={active===slug?"active":""} key={slug} href={`/nemovitosti/${propertyId}/${slug}`}>{label}</Link>)}</nav>;
}
