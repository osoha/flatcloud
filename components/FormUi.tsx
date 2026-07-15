import Link from "next/link";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <div className={error ? "flash error-flash" : "flash success-flash"}>{error || ok}</div>;
}

export function FormPage({ title, description, backHref, children }: { title: string; description?: string; backHref: string; children: React.ReactNode }) {
  return <div className="page form-page"><div className="breadcrumb"><Link href={backHref}>← Zpět</Link></div><div className="page-title"><div><h1>{title}</h1>{description&&<p>{description}</p>}</div></div>{children}</div>;
}

export function FormCard({ action, children, submitLabel = "Uložit", cancelHref, method = "post" }: { action: string; children: React.ReactNode; submitLabel?: string; cancelHref: string; method?: "post" }) {
  return <form className="card edit-form" action={action} method={method}><div className="form-grid">{children}</div><div className="form-actions"><Link className="secondary" href={cancelHref}>Zrušit</Link><button className="primary" type="submit">{submitLabel}</button></div></form>;
}

export function Field({ label, name, defaultValue, required, type = "text", placeholder, min, max, step, full = false }: { label: string; name: string; defaultValue?: string | number | null; required?: boolean; type?: string; placeholder?: string; min?: number; max?: number; step?: string; full?: boolean }) {
  return <label className={`field ${full ? "field-full" : ""}`}><span>{label}{required&&" *"}</span><input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} min={min} max={max} step={step}/></label>;
}

export function Textarea({ label, name, defaultValue, full = true, placeholder }: { label: string; name: string; defaultValue?: string | null; full?: boolean; placeholder?: string }) {
  return <label className={`field ${full ? "field-full" : ""}`}><span>{label}</span><textarea name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder}/></label>;
}

export function Select({ label, name, defaultValue, options, required, full = false }: { label: string; name: string; defaultValue?: string; options: [string,string][]; required?: boolean; full?: boolean }) {
  return <label className={`field ${full ? "field-full" : ""}`}><span>{label}{required&&" *"}</span><select name={name} defaultValue={defaultValue} required={required}>{options.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>;
}

export function Checkbox({ label, name, defaultChecked = true, full = false }: { label: string; name: string; defaultChecked?: boolean; full?: boolean }) {
  return <label className={`checkbox-field ${full ? "field-full" : ""}`}><input type="checkbox" name={name} defaultChecked={defaultChecked}/><span>{label}</span></label>;
}
