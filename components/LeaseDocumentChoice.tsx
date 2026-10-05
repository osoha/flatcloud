"use client";
import { useState } from "react";
export function LeaseDocumentChoice() {
  const [origin, setOrigin] = useState("NEW");
  return (
    <section className="field-full card">
      <h2>Jak chcete smlouvu založit?</h2>
      <div className="form-grid">
        <label className="checkbox-field">
          <input
            type="radio"
            name="documentOrigin"
            value="EXISTING"
            checked={origin === "EXISTING"}
            onChange={() => setOrigin("EXISTING")}
          />
          <span>
            <strong>Mám existující dokument smlouvy</strong>
            <br />
            Doplňte údaje nájmu a po uložení nahrajte dokument. Automatické
            čtení a předvyplnění z dokumentu připravujeme do budoucna.
          </span>
        </label>
        <label className="checkbox-field">
          <input
            type="radio"
            name="documentOrigin"
            value="NEW"
            checked={origin === "NEW"}
            onChange={() => setOrigin("NEW")}
          />
          <span>
            <strong>Nemám smlouvu, vytvářím novou</strong>
            <br />
            Údaje zadejte jednou. Po uložení nabídneme vygenerování smlouvy ze
            vzoru se známými údaji vlastníka, nájemníka, bytu a plateb.
          </span>
        </label>
      </div>
      <p>
        {origin === "NEW"
          ? "Po dokončení zkontrolujete náhled. PDF můžete podepsat v aplikaci nebo vytisknout, podepsat fyzicky a vložit sken."
          : "Nahraná smlouva zůstane samostatným dokumentem. Její údaje před založením zkontrolujte."}
      </p>
    </section>
  );
}
