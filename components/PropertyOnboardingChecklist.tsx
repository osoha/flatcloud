import Link from "next/link";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";

export type OnboardingStep = { label: string; detail: string; href: string; done: boolean; required?: boolean };

export function PropertyOnboardingChecklist({ propertyId, steps }: { propertyId: string; steps: OnboardingStep[] }) {
  const required = steps.filter((step) => step.required !== false);
  const complete = required.filter((step) => step.done).length;
  const progress = required.length ? Math.round(complete / required.length * 100) : 100;
  return <section className={`card onboarding-checklist ${progress === 100 ? "complete" : ""}`} aria-labelledby="onboarding-title">
    <div className="card-head"><div><span className="eyebrow"><Sparkles size={13}/> Připravenost objektu</span><h2 id="onboarding-title">{progress === 100 ? "Základní nastavení je dokončeno" : "Dokončete nastavení nemovitosti"}</h2><p className="muted-copy">FlatCloud vás provede od jednotek k aktivnímu inkasu. Doporučené kroky lze doplnit později.</p></div><div className="onboarding-progress"><strong>{progress} %</strong><span>{complete} z {required.length} povinných kroků</span></div></div>
    <div className="onboarding-progress-track"><i style={{ width: `${progress}%` }}/></div>
    <div className="onboarding-step-grid">{steps.map((step)=><Link className={`onboarding-step-card ${step.done ? "done" : ""}`} href={step.href} key={step.label}>{step.done?<CheckCircle2 size={19}/>:<Circle size={19}/>}<span><strong>{step.label}</strong><small>{step.detail}</small></span><b>{step.done ? "Hotovo" : step.required === false ? "Doporučeno" : "Pokračovat →"}</b></Link>)}</div>
    <div className="onboarding-footer"><Link href="/metodika#zalozeni-nemovitosti">Otevřít metodiku převzetí nemovitosti →</Link><Link href={`/nemovitosti/${propertyId}/provoz`}>Provozní nastavení objektu →</Link></div>
  </section>;
}
