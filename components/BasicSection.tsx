import Link from "next/link";
import type { ReactNode } from "react";

export function BasicSectionHero({ eyebrow, title, description, berry, message }: { eyebrow: string; title: string; description: string; berry: "finance" | "notifications" | "tasks" | "contracts"; message: string }) {
  return <header className="basic-section-hero">
    <div><span className="basic-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p><strong>{message}</strong></div>
    <img src={`/guide/${berry}.webp`} alt="" aria-hidden="true"/>
  </header>;
}

export function BasicSectionStat({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: "blue" | "green" | "amber" | "red" }) {
  return <div className={`basic-section-stat tone-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export function BasicSectionItem({ href, icon, title, context, end, tone }: { href: string; icon: ReactNode; title: string; context: string; end?: ReactNode; tone?: "red" | "amber" | "green" }) {
  return <Link className={`basic-section-item${tone ? ` tone-${tone}` : ""}`} href={href}><span className="basic-section-item-icon">{icon}</span><span className="basic-section-item-copy"><strong>{title}</strong><small>{context}</small></span>{end&&<span className="basic-section-item-end">{end}</span>}</Link>;
}
