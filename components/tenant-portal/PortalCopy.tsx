"use client";

import {useState} from "react";
import {Check, Copy} from "lucide-react";

export function PortalCopy({text}: {text: string}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return <div className="tp-copy"><button className="tp-button tp-button-soft" type="button" onClick={async () => {
    try {await navigator.clipboard.writeText(text); setState("copied");}
    catch {setState("failed");}
  }}>{state === "copied" ? <Check size={17}/> : <Copy size={17}/>} {state === "copied" ? "Údaje zkopírovány" : "Kopírovat údaje"}</button><span className={state === "failed" ? "tp-copy-feedback" : "sr-only"} role="status">{state === "failed" ? "Kopírování se nepodařilo. Údaje můžete označit a zkopírovat ručně." : state === "copied" ? "Platební údaje jsou ve schránce." : ""}</span></div>;
}
