"use client";
import { useEffect, useState } from "react";
export function EntityAvatarChoice({ selected, photos }: { selected: string; photos: { id: string; title: string }[] }) {
  const initial = selected === "upload" ? "upload" : photos.some(p => p.id === selected) ? "photo" : "icon";
  const [mode, setMode] = useState(initial), [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState("");
  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  return <div className="avatar-choice"><label className="field"><span>Avatar objektu / jednotky</span><select value={mode} onChange={event => { setMode(event.target.value); setFile(null); }}><option value="icon">Obecná ikona</option><option value="photo" disabled={!photos.length}>Vybrat z nahraných fotografií</option><option value="upload">Nahrát nový avatar</option></select></label>
    {mode === "photo" ? <label className="field"><span>Titulní fotografie</span><select name="photoId" defaultValue={selected}>{photos.map(photo => <option key={photo.id} value={photo.id}>{photo.title}</option>)}</select></label> : <input type="hidden" name="photoId" value={mode}/>}
    {mode === "upload" && <label className="field"><span>Fotografie avatara</span><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)}/><small>JPG, PNG nebo WebP, nejvýše 2 MB. Fotografii automaticky otočíme a upravíme do čtverce stejně jako uživatelský avatar.{selected === "upload" ? " Bez nového souboru zůstane současný avatar." : ""}</small>{preview && <img className="avatar-choice-preview" src={preview} alt="Náhled vybraného avatara"/>}</label>}
  </div>;
}
