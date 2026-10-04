"use client";
import {useRef,useState} from "react";
export function ReceiptSignatureSettings({name,address,enabled,hasSignature}:{name:string;address:string;enabled:boolean;hasSignature:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null),drawing=useRef(false);
  const [drawn,setDrawn]=useState(""),[uploaded,setUploaded]=useState(false),[remove,setRemove]=useState(false),[uploadPreview,setUploadPreview]=useState("");
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{const c=e.currentTarget,r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};};
  return <section className="card account-card receipt-signature-settings" id="podpis"><h2>Podpis a doklady o zaplacení</h2><p>Uložte vlastní podpis a údaje vystavitele. Povolíte tím nájemníkům vystavit doklad pouze k plně uhrazenému nájmu ve vaší správě. Již vystavené doklady zůstanou uložené v původní podobě.</p><form action="/api/account/receipt-signature" method="post" encType="multipart/form-data" className="account-form">
    <label className="field"><span>Jméno / název vystavitele</span><input name="issuerName" defaultValue={name} maxLength={160} required/></label>
    <label className="field"><span>Adresa vystavitele</span><input name="issuerAddress" defaultValue={address} maxLength={240} required/></label>
    {hasSignature&&!drawn&&!uploaded&&!remove&&<div className="signature-preview"><img src="/api/account/receipt-signature" alt="Uložený podpis vystavitele"/></div>}
    {uploadPreview&&uploaded&&!remove&&<div className="signature-preview"><img src={uploadPreview} alt="Náhled nahraného podpisu"/></div>}
    <label className="field"><span>Nakreslit vlastní podpis</span><canvas ref={canvas} width={720} height={220} aria-label="Plocha pro kreslení podpisu" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drawing.current=true;const p=point(e),ctx=e.currentTarget.getContext("2d")!;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.strokeStyle="#142b4d";ctx.lineWidth=3;ctx.lineCap="round";}} onPointerMove={e=>{if(!drawing.current)return;const p=point(e),ctx=e.currentTarget.getContext("2d")!;ctx.lineTo(p.x,p.y);ctx.stroke();setUploaded(false);setRemove(false);}} onPointerUp={e=>{drawing.current=false;setDrawn(e.currentTarget.toDataURL("image/png"));}} onPointerCancel={()=>{drawing.current=false;}}/></label>
    <input type="hidden" name="drawnSignature" value={uploaded||remove?"":drawn}/><button type="button" className="secondary" onClick={()=>{canvas.current?.getContext("2d")?.clearRect(0,0,720,220);setDrawn("");}}>Vymazat kresbu</button>
    <label className="field"><span>Nebo nahrát obrázek vlastního podpisu (PNG, JPG, WebP, do 2 MB)</span><input type="file" name="signature" accept="image/png,image/jpeg,image/webp" onChange={e=>{if(uploadPreview)URL.revokeObjectURL(uploadPreview);setUploadPreview(e.target.files?.[0]?URL.createObjectURL(e.target.files[0]):"");setUploaded(Boolean(e.target.files?.length));setDrawn("");setRemove(false);}}/></label>
    {hasSignature&&<label className="checkbox-field"><input type="checkbox" name="removeSignature" checked={remove} onChange={e=>setRemove(e.target.checked)}/><span>Odstranit uložený podpis a vypnout vystavování</span></label>}
    <label className="checkbox-field"><input type="checkbox" name="issuanceEnabled" defaultChecked={enabled}/><span>Jsem oprávněn vystavovat tyto doklady a povoluji použití vlastního podpisu na dokladech o skutečně přijatých úhradách.</span></label>
    <small>Ukládá se obrázek podpisu; nejde o kvalifikovaný elektronický podpis.</small><button className="primary" type="submit">Uložit podpis a vystavování</button>
  </form></section>;
}
