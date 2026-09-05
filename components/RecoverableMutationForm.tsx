"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Draft = Record<string, string | boolean>;
const volatileDrafts = new Map<string, Draft>();

function controlKey(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
) {
  return control instanceof HTMLInputElement &&
    (control.type === "checkbox" || control.type === "radio")
    ? `${control.name}:${control.value}`
    : control.name;
}

function readDraft(form: HTMLFormElement) {
  const draft: Draft = {};
  for (const control of Array.from(form.elements)) {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      !control.name ||
      control.type === "file" ||
      control.type === "password"
    )
      continue;
    draft[controlKey(control)] =
      control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio")
        ? control.checked
        : control.value;
  }
  return draft;
}

function restoreDraft(form: HTMLFormElement, draft: Draft) {
  for (const control of Array.from(form.elements)) {
    if (
      !(
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) ||
      !control.name
    )
      continue;
    const value = draft[controlKey(control)];
    if (value === undefined) continue;
    if (
      control instanceof HTMLInputElement &&
      (control.type === "checkbox" || control.type === "radio")
    )
      control.checked = Boolean(value);
    else control.value = String(value);
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function RecoverableMutationForm({
  action,
  cancelHref,
  submitLabel,
  draftKey,
  children,
}: {
  action: string;
  cancelHref: string;
  submitLabel: string;
  draftKey: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const form = formRef.current;
    const draft = volatileDrafts.get(draftKey);
    if (form && draft) restoreDraft(form, draft);
    const warn = (event: BeforeUnloadEvent) => {
      if (!volatileDrafts.has(draftKey)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftKey]);

  return (
    <form
      ref={formRef}
      className="card edit-form"
      action={action}
      method="post"
      onInput={(event) =>
        volatileDrafts.set(draftKey, readDraft(event.currentTarget))
      }
      onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setError("");
        try {
          const response = await fetch(action, {
            method: "POST",
            body: new FormData(event.currentTarget),
            credentials: "same-origin",
          });
          const target = new URL(response.url || action, window.location.href);
          const message = target.searchParams.get("error");
          if (!response.ok || message) {
            setError(
              message ||
                "Zápis se nepodařilo dokončit. Zkontrolujte údaje a zkuste to znovu.",
            );
            return;
          }
          volatileDrafts.delete(draftKey);
          window.location.assign(target.href);
        } catch {
          setError(
            "Spojení se serverem selhalo. Zadané hodnoty zůstaly zachovány; zkuste odeslání znovu.",
          );
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {error && (
        <div
          className="flash error-flash field-full"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}
      <div className="form-grid">{children}</div>
      <div className="form-actions">
        <Link
          className="secondary"
          href={cancelHref}
          onClick={() => volatileDrafts.delete(draftKey)}
        >
          Zrušit
        </Link>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Ukládám…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
