import Link from "next/link";

const items = [
  { key: "overview", href: "/nastaveni", label: "Přehled" },
  { key: "system", href: "/nastaveni/system", label: "Integrace a automatizace" },
  { key: "reporting", href: "/reporty/sablony", label: "Reporting" },
  { key: "users", href: "/uzivatele", label: "Uživatelé" },
] as const;

export function AdminSubnav({ active }: { active: typeof items[number]["key"] }) {
  return <nav className="admin-subnav" aria-label="Sekce administrace">
    {items.map((item) => <Link key={item.key} className={active === item.key ? "active" : ""} href={item.href}>{item.label}</Link>)}
  </nav>;
}
