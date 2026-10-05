"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ReceiptSettings.module.css";

type Props = {
  ownerId: string;
  representativeId: string;
  revision: string;
  profileRevision: number;
  issuerName: string;
  issuerAddress: string;
  signerName: string;
  hasSavedSignature: boolean;
};

/** The consent is always submitted by the signer's own authenticated account. */
export function OwnerRepresentativeConsent(props: Props) {
  const [method, setMethod] = useState<"draw" | "upload" | "saved">("draw");
  const [drawnSignature, setDrawnSignature] = useState("");
  const [uploadPreview, setUploadPreview] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ink = useRef(false);
  const changeMethod = (next: "draw" | "upload" | "saved") => {
    drawing.current = false; ink.current = false; setDrawnSignature(""); setUploadPreview(""); setMethod(next);
  };
  useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview); }, [uploadPreview]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const area = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - area.left) * event.currentTarget.width / area.width, y: (event.clientY - area.top) * event.currentTarget.height / area.height };
  };

  return <form action={`/api/owners/${props.ownerId}/representatives/${props.representativeId}/consent`} method="post" encType="multipart/form-data" className={styles.form}>
    <input type="hidden" name="revision" value={props.revision}/>
    <input type="hidden" name="profileRevision" value={props.profileRevision}/>
    <input type="hidden" name="action" value="consent"/>
    <div className={styles.identity}><strong>{props.issuerName}</strong><span>{props.issuerAddress}</span><span>Jednající osoba: {props.signerName}</span></div>
    <fieldset className={styles.choices}><legend>Váš podpis pro tohoto pronajímatele</legend>
      <label><input type="radio" name="signatureMethod" value="draw" checked={method === "draw"} onChange={() => changeMethod("draw")}/>Nakreslit podpis</label>
      <label><input type="radio" name="signatureMethod" value="upload" checked={method === "upload"} onChange={() => changeMethod("upload")}/>Nahrát obrázek</label>
      {props.hasSavedSignature && <label><input type="radio" name="signatureMethod" value="saved" checked={method === "saved"} onChange={() => changeMethod("saved")}/>Použít můj podpis z účtu</label>}
    </fieldset>
    {method === "draw" && <>
      <canvas ref={canvas} width={900} height={300} className={styles.signatureCanvas} aria-label="Nakreslit vlastní podpis pro pronajímatele" onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true;
        const ctx = event.currentTarget.getContext("2d"), p = point(event); if (!ctx) return;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.strokeStyle = "#142b4d"; ctx.lineWidth = 3; ctx.lineCap = "round";
      }} onPointerMove={event => {
        if (!drawing.current) return; const ctx = event.currentTarget.getContext("2d"), p = point(event); if (!ctx) return;
        ctx.lineTo(p.x, p.y); ctx.stroke(); ink.current = true;
      }} onPointerUp={event => { drawing.current = false; if (ink.current) setDrawnSignature(event.currentTarget.toDataURL("image/png")); }} onPointerCancel={() => { drawing.current = false; }}/>
      <input type="hidden" name="drawnSignature" value={drawnSignature}/>
      <button type="button" className="secondary" onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 900, 300); ink.current = false; setDrawnSignature(""); }}>Vymazat kresbu</button>
    </>}
    {method === "upload" && <>
      <label className="field"><span>Obrázek vlastního podpisu (PNG, JPG, WebP, do 2 MB)</span><input type="file" name="signature" accept="image/png,image/jpeg,image/webp" required onChange={event => setUploadPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : "")}/></label>
      {uploadPreview && <img src={uploadPreview} alt="Náhled vašeho podpisu" className={styles.signaturePreview}/>}
    </>}
    {method === "saved" && <>
      <input type="hidden" name="useSavedSignature" value="on"/>
      <img src="/api/account/receipt-signature" alt="Váš uložený osobní podpis" className={styles.signaturePreview}/>
      <small>Uloží se samostatná kopie podpisu pro tohoto pronajímatele. Pozdější změna podpisu v účtu ji nezmění.</small>
    </>}
    <label className="checkbox-field"><input type="checkbox" name="authorization" required/><span>Jsem oprávněn jednat za {props.issuerName} a souhlasím s použitím svého podpisu na dokladech o skutečně přijatých úhradách tohoto pronajímatele.</span></label>
    <small>Souhlas platí pro uvedené údaje pronajímatele. Při jejich změně jej musíte potvrdit znovu. Již vystavené doklady zůstávají beze změny.</small>
    <button type="submit" className="primary" disabled={method === "draw" && !drawnSignature}>Potvrdit oprávnění a uložit podpis</button>
  </form>;
}
