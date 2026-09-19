import Link from "next/link";

export function PortfolioQualitySubnav({ active, query = "" }: { active: "queue" | "forecast"; query?: string }) {
  return <nav className="quality-subnav" aria-label="Kvalita a CAPEX">
    <Link className={active === "queue" ? "active" : ""} href={`/portfolio/kvalita${query}`}>Fronta obnovy</Link>
    <Link className={active === "forecast" ? "active" : ""} href={`/portfolio/kvalita/plan${query}`}>CAPEX výhled</Link>
  </nav>;
}
