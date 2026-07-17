import Link from "next/link";

const fullSections = [
  ["prehled", "Přehled"], ["jednotky", "Jednotky"], ["vlastnici", "Vlastníci a SPV"], ["najemnici", "Nájemníci"],
  ["smlouvy", "Smlouvy"], ["platby", "Příchozí platby"],
  ["dluznici", "Dlužníci"], ["technicke-udaje", "Technické údaje"], ["banka", "Banka a pravidla"], ["uzivatele", "Uživatelé"], ["nastaveni", "Nastavení"],
];
const unitSections = [["prehled","Přehled"],["jednotky","Moje jednotky"],["najemnici","Nájemníci"],["smlouvy","Smlouvy"],["platby","Platby"],["dluznici","Saldo"]];

export function PropertySubnav({ propertyId, active, unitLimited=false }: { propertyId: string; active: string; unitLimited?: boolean }) {
  const sections=unitLimited?unitSections:fullSections;
  return <nav className="section-nav">{sections.map(([slug,label])=><Link className={active===slug?"active":""} key={slug} href={`/nemovitosti/${propertyId}/${slug}`}>{label}</Link>)}</nav>;
}
