"use client";
import { useRef, useState } from "react";
export function PersonalContractSignature({
  hasSignature,
  returnToAccount = false,
}: {
  hasSignature: boolean;
  returnToAccount?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  const [image, setImage] = useState("");
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * 720) / r.width,
      y: ((e.clientY - r.top) * 220) / r.height,
    };
  }
  return (
    <form action="/api/portal/signature" method="post" className="edit-form">
      {returnToAccount && (
        <input type="hidden" name="returnTo" value="account" />
      )}
      <p>
        Uložte vlastní podpis. Při podpisu každého dokumentu znovu potvrdíte
        jeho použití a zadáte heslo.
      </p>
      {hasSignature && (
        <img
          src="/api/portal/signature"
          alt="Váš uložený podpis"
          style={{ maxWidth: 300 }}
        />
      )}
      <label className="field field-full">
        <span>Nakreslit vlastní podpis</span>
        <canvas
          ref={canvas}
          width={720}
          height={220}
          aria-label="Plocha pro kreslení osobního podpisu"
          style={{
            width: "100%",
            maxWidth: 720,
            border: "1px solid #cbd5df",
            background: "white",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const p = point(e),
              c = e.currentTarget.getContext("2d")!;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.strokeStyle = "#142b4d";
            c.lineWidth = 3;
            c.lineCap = "round";
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = point(e),
              c = e.currentTarget.getContext("2d")!;
            c.lineTo(p.x, p.y);
            c.stroke();
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            setImage(e.currentTarget.toDataURL("image/png"));
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
      </label>
      <input type="hidden" name="drawnSignature" value={image} />
      <button
        type="button"
        className="secondary"
        onClick={() => {
          canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 220);
          setImage("");
        }}
      >
        Vymazat kresbu
      </button>
      <label className="checkbox-field">
        <input type="checkbox" name="ownSignature" required />
        <span>
          Jde o můj vlastní podpis. Jeho použití potvrdím pro každý konkrétní
          dokument.
        </span>
      </label>
      <label className="field">
        <span>Potvrzení heslem</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </label>
      <button className="primary" disabled={!image}>
        Uložit vlastní podpis
      </button>
      <p>
        Ukládáme obrázek podpisu, nikoliv biometrický záznam pohybu. Nejde o
        kvalifikovaný elektronický podpis.
      </p>
    </form>
  );
}
