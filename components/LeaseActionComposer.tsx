"use client";
import { useState } from "react";
export function LeaseActionComposer({
  leaseId,
  documents,
  signers,
  defaultDocumentId,
  nonRenewal,
}: {
  leaseId: string;
  documents: Array<{ id: string; title: string }>;
  signers: Array<{ id: string; name: string }>;
  defaultDocumentId: string;
  nonRenewal: string;
}) {
  const [kind, setKind] = useState(defaultDocumentId ? "SIGN" : "READ"),
    [title, setTitle] = useState(
      defaultDocumentId ? "Nájemní smlouva k podpisu" : "",
    ),
    [body, setBody] = useState(
      defaultDocumentId
        ? "Projděte přiloženou smlouvu. Podpisem vyjadřujete souhlas s jejím konkrétním zněním."
        : "",
    );
  return (
    <form
      action={`/api/leases/${leaseId}/actions`}
      method="post"
      className="edit-form"
    >
      <h2>Předat dokument nebo sdělení do portálu</h2>
      <label className="field">
        <span>Požadovaný úkon</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            if (e.target.value === "NON_RENEWAL") {
              setTitle("Oznámení o skončení nájmu a neprodloužení smlouvy");
              setBody(nonRenewal);
            } else if (kind === "NON_RENEWAL") {
              setTitle("");
              setBody("");
            }
          }}
        >
          <option value="SIGN">Podepsat smlouvu nebo dodatek</option>
          <option value="RECEIVE">
            Potvrdit převzetí dokumentu (např. vyúčtování)
          </option>
          <option value="READ">Potvrdit přečtení sdělení</option>
          <option value="APPROVE">Schválit splnění úkolu</option>
          {nonRenewal && (
            <option value="NON_RENEWAL">Oznámení o neprodloužení nájmu</option>
          )}
        </select>
      </label>
      <label className="field">
        <span>Dokument PDF {kind === "SIGN" ? "*" : "(nepovinný)"}</span>
        <select
          name="documentId"
          defaultValue={defaultDocumentId}
          required={kind === "SIGN"}
        >
          <option value="">Bez přílohy</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Název</span>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="field field-full">
        <span>Přesné sdělení / rozsah schvalovaného úkolu</span>
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          maxLength={12000}
          required
        />
      </label>
      {kind === "SIGN" && (
        <>
          <label className="field">
            <span>Osoba podepisující za pronajímatele</span>
            <select name="staffSignerId" required>
              <option value="">Vyberte účet uvedené podepisující osoby</option>
              {signers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Doložené oprávnění podepisující osoby</span>
            <input
              name="authority"
              required
              maxLength={350}
              placeholder="Osobně jako pronajímatel / jednatel / plná moc ze dne…"
            />
          </label>
          <p>
            Ověřte, že vybraný účet patří osobě uvedené ve smlouvě a že má
            oprávnění ji podepsat. Přístup správce sám oprávnění zastupovat
            pronajímatele nenahrazuje.
          </p>
        </>
      )}
      <label className="field">
        <span>Požadovaný termín potvrzení</span>
        <input
          name="dueDate"
          type="date"
          defaultValue={new Date(Date.now() + 7 * 86400000)
            .toISOString()
            .slice(0, 10)}
        />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" name="confirmed" required />
        <span>
          Zkontroloval/a jsem přesný obsah, přílohu, oprávnění podepisujících a
          předávám úkon všem smluvním nájemcům.
        </span>
      </label>
      <button className="primary">Předat do portálu nájemníka</button>
      <p>
        Příjemci bez účtu úkon uvidí po přijetí pozvánky do portálu. Tento krok
        neodesílá e-mail ani pozvánku.
      </p>
      <p>
        PDF lze také uložit bez elektronických podpisů, podepsat fyzicky a
        nahrát sken. U jednostranných oznámení potvrzení převzetí není souhlas s
        obsahem.
      </p>
    </form>
  );
}
