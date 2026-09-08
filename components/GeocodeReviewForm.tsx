"use client";
import { useRef, useState } from "react";
type Proposal = { propertyId: string; index: number; address: string; latitude: number; longitude: number; displayName: string; quality: string };
export function GeocodeReviewForm({ action, children }: { action: string; children: React.ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form ref={formRef} className="card annual-report-editor" action={action} method="post" onSubmit={async event => {
    if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !== "geocode") return;
    event.preventDefault();
    setBusy(true); setMessage(""); setProposals([]);
    try {
      const data = new FormData(event.currentTarget); data.set("mode", "geocode");
      const response = await fetch(action, { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Návrhy poloh se nepodařilo načíst.");
      setProposals(result.proposals);
      setMessage(result.proposals.length ? "Návrhy nejsou uložené. Porovnejte nalezenou adresu; bod lze použít do formuláře a ručně opravit." : "Pro chybějící polohy nebyl nalezen návrh. Souřadnice zadejte ručně.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Mapová služba je nedostupná."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>{children}</fieldset>
    {busy && <p role="status">Hledám návrhy poloh…</p>}
    {message && <p role="status">{message}</p>}
    {proposals.map(proposal => <section className="notice" key={proposal.propertyId}><strong>{proposal.address}</strong><span>Nalezeno: {proposal.displayName}</span><p>{proposal.quality} · {proposal.latitude}, {proposal.longitude}</p><button className="secondary" type="button" onClick={() => {
      for (const [name, value] of [["latitude", proposal.latitude], ["longitude", proposal.longitude]] as const) {
        const input = formRef.current!.elements.namedItem(`property.${proposal.index}.${name}`) as HTMLInputElement;
        input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const confirm = formRef.current!.elements.namedItem("confirmCoordinates") as HTMLInputElement;
      confirm.checked = false;
      setMessage("Návrh je ve formuláři. Zkontrolujte nebo opravte souřadnice a teprve potom uložte mapu.");
    }}>Použít návrh do formuláře</button></section>)}
    <label className="checkbox-field"><input type="checkbox" name="confirmCoordinates" value="1"/>Zkontroloval/a jsem polohu změněných bodů a potvrzuji jejich uložení.</label>
  </form>;
}
