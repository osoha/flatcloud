"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { QuarterlyPropertyPhotoCandidate } from "./types";

function protectUnsavedEditorialChanges(event: FormEvent<HTMLFormElement>) {
  if (document.documentElement.dataset.quarterlyEditorialDirty !== "true") return;
  if (!window.confirm("Máte neuložené změny technických oblastí nebo ocenění. Nahráním fotografie se stránka znovu načte. Opravdu chcete pokračovat?")) {
    event.preventDefault();
    return;
  }
  window.dispatchEvent(new Event("quarterly-report-external-submit"));
}

export function QuarterlyReportPrimaryPhoto({ selected, candidates, editable, baseAction, slot = "primary" }: { selected: { id: string; caption: string | null } | null; candidates: QuarterlyPropertyPhotoCandidate[]; editable: boolean; baseAction: string; slot?: "primary" | "supportive" }) {
  const supportive = slot === "supportive", mediaAction = `${baseAction}/media/${slot}`;
  const heading = supportive ? "Doplňková fotografie" : "Hlavní fotografie";
  const purpose = supportive ? "Komentář k nemovitosti" : "Titulní strana";
  const uploadSubmitting = useRef(false);
  const [uploading, setUploading] = useState(false);
  const submitUpload = (event: FormEvent<HTMLFormElement>) => {
    if (uploadSubmitting.current) { event.preventDefault(); return; }
    protectUnsavedEditorialChanges(event);
    if (event.defaultPrevented) return;
    uploadSubmitting.current = true;
    setUploading(true);
  };
  return <section className="card quarterly-primary-photo"><div className="card-head"><div><span className="quarterly-eyebrow">Fotografie reportu · {purpose}</span><h2>{heading}</h2><p className="muted-copy">Výběr odkazuje na přesný uložený soubor z dokumentů stejné nemovitosti. Nejde o finální PDF náhled.</p></div></div>
    {selected ? <div className="quarterly-selected-photo"><img src={`${baseAction}/media/${selected.id}/image?variant=preview`} alt={selected.caption || heading}/><div>{editable ? <><form className="edit-form" action={mediaAction} method="post" onSubmit={protectUnsavedEditorialChanges}><input type="hidden" name="action" value="update-caption"/><label className="field"><span>Popisek fotografie</span><input name="caption" defaultValue={selected.caption || ""} maxLength={500}/></label><button className="secondary" type="submit">Uložit popisek</button></form><form action={mediaAction} method="post" onSubmit={protectUnsavedEditorialChanges}><button className="danger-button" name="action" value="remove" type="submit">Odebrat z reportu</button></form></> : <p className="muted-copy">{selected.caption || "Bez popisku"}</p>}</div></div> : <p className="muted-copy">{heading} zatím není vybrána. Její absence neblokuje kontrolu ani publikaci.</p>}
    {editable && <><div className="quarterly-photo-picker"><h3>{selected ? "Nahradit fotografii" : "Vybrat fotografii"}</h3>{candidates.length ? <form className="edit-form" action={mediaAction} method="post" onSubmit={protectUnsavedEditorialChanges}><input type="hidden" name="action" value="select"/><div className="quarterly-photo-candidates">{candidates.map((candidate) => <label key={candidate.id}><input type="radio" name="sourceDocumentId" value={candidate.id} required/><img loading="lazy" src={`${baseAction}/media/candidates/${candidate.id}/image?variant=thumbnail`} alt=""/><span><strong>{candidate.title}</strong><small>{candidate.photoStage || "PHOTO"}{candidate.documentDate ? ` · ${candidate.documentDate.toLocaleDateString("cs-CZ")}` : ""}</small></span></label>)}</div><label className="field"><span>Popisek vybrané fotografie</span><input name="caption" maxLength={500}/></label><button className="primary" type="submit">Uložit {supportive ? "doplňkovou" : "hlavní"} fotografii</button></form> : <p className="muted-copy">Pro tuto nemovitost nejsou v dokumentech dostupné fotografie.</p>}</div>
      <div className="quarterly-photo-upload"><h3>Nahrát novou fotografii</h3><form className="edit-form" action={`${mediaAction}/upload`} method="post" encType="multipart/form-data" onSubmit={submitUpload}><label className="field"><span>Soubor fotografie</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp" required/></label><label className="field"><span>Popisek fotografie (volitelný)</span><input name="caption" maxLength={500}/></label><button className="primary" type="submit" disabled={uploading} aria-live="polite">{uploading ? "Nahrávám fotografii…" : "Nahrát a použít"}</button></form></div></>}
  </section>;
}
