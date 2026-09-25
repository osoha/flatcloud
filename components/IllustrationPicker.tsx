"use client";

import { useState } from "react";
import { illustration, illustrationCount, illustrationStyle, suggestedIllustration, type IllustrationKind } from "@/lib/illustration-library";

export function IllustrationPicker({ kind, selected, name = "avatarChoice", allowPhoto = false }: { kind: IllustrationKind; selected?: string | null; name?: string; allowPhoto?: boolean }) {
  const initial = selected || illustration(kind, 0);
  const [choice, setChoice] = useState(initial);
  const [preview, setPreview] = useState<string | null>(null);
  return <fieldset className="illustration-picker field-full"><legend>{kind === "person" ? "Avatar osoby" : kind === "house" ? "Obrázek domu" : "Obrázek bytu"}</legend>
    <p className="muted-copy">Vyberte ilustraci z knihovny{allowPhoto ? " nebo nahrajte vlastní fotografii" : ". Fotografii můžete nahrát i později v profilu"}.</p>
    <div className="illustration-picker-grid">{Array.from({ length: illustrationCount[kind] }, (_, index) => {
      const value = illustration(kind, index);
      return <label key={value} className={`illustration-option${choice === value ? " selected" : ""}`} title={`${kind === "person" ? "Postava" : kind === "house" ? "Dům" : "Byt"} ${index + 1}`}><input type="radio" name={name} value={value} checked={choice === value} onChange={() => setChoice(value)}/><span className="illustration-tile" style={illustrationStyle(value)}/><span className="sr-only">Ilustrace {index + 1}</span></label>;
    })}</div>
    {allowPhoto && <label className="field"><span>Nahrát vlastní fotografii</span><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (preview) URL.revokeObjectURL(preview); setPreview(file ? URL.createObjectURL(file) : null); if (file) setChoice("upload"); }}/><small>JPG, PNG nebo WebP, nejvýše 2 MB.</small>{preview && <img src={preview} className="avatar-choice-preview" alt="Náhled nahrané fotografie"/>}</label>}
    {allowPhoto && choice === "upload" && <input type="hidden" name={name} value="upload"/>}
  </fieldset>;
}
