"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Draft = Record<string, string | boolean>;
const volatileDrafts = new Map<string, Draft>();
const HISTORY_DRAFTS = "__flatcloudRecoverableDrafts";
const HISTORY_SUBMITTED = "__flatcloudSubmittedForms";

function historyRecord(key: string): Record<string, Draft | boolean> {
  const state = window.history.state as Record<string, unknown> | null;
  const value = state?.[key];
  return value && typeof value === "object" ? value as Record<string, Draft | boolean> : {};
}

function historyDraft(draftKey: string) {
  const value = historyRecord(HISTORY_DRAFTS)[draftKey];
  return value && typeof value === "object" ? value as Draft : undefined;
}

function persistDraft(draftKey: string, draft: Draft) {
  volatileDrafts.set(draftKey, draft);
  const state = window.history.state as Record<string, unknown> | null;
  window.history.replaceState({ ...(state || {}), [HISTORY_DRAFTS]: { ...historyRecord(HISTORY_DRAFTS), [draftKey]: draft } }, "");
}

function clearDraft(draftKey: string, submitted = false) {
  volatileDrafts.delete(draftKey);
  const state = window.history.state as Record<string, unknown> | null;
  const drafts = { ...historyRecord(HISTORY_DRAFTS) };
  delete drafts[draftKey];
  const submittedForms = { ...historyRecord(HISTORY_SUBMITTED), ...(submitted ? { [draftKey]: true } : {}) };
  window.history.replaceState({ ...(state || {}), [HISTORY_DRAFTS]: drafts, [HISTORY_SUBMITTED]: submittedForms }, "");
}

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
      control.type === "hidden" ||
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
    ) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
      setter?.call(control, Boolean(value));
    } else {
      const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(control, String(value));
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function RecoverableMutationForm({
  action,
  cancelHref,
  submitLabel,
  draftKey,
  idempotencyFieldName,
  children,
}: {
  action: string;
  cancelHref: string;
  submitLabel: string;
  draftKey: string;
  idempotencyFieldName?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [idempotencyToken, setIdempotencyToken] = useState("");

  useEffect(() => {
    const form = formRef.current;
    const restore = () => {
      if (historyRecord(HISTORY_SUBMITTED)[draftKey]) { setCompleted(true); form?.reset(); return; }
      const draft = volatileDrafts.get(draftKey) || historyDraft(draftKey);
      if (form && draft) { restoreDraft(form, draft); window.setTimeout(() => restoreDraft(form, draft), 0); }
    };
    restore();
    window.addEventListener("pageshow", restore);
    const warn = (event: BeforeUnloadEvent) => {
      if (!volatileDrafts.has(draftKey) && !historyDraft(draftKey)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("pageshow", restore); };
  }, [draftKey]);

  useEffect(() => {
    if (idempotencyFieldName) setIdempotencyToken(window.crypto.randomUUID());
  }, [idempotencyFieldName]);

  if (completed) return <div className="card empty-state" role="status"><h2>Formulář už byl odeslán</h2><p>Stejný zápis nelze z historie prohlížeče odeslat podruhé.</p><Link className="primary" href={cancelHref}>Pokračovat</Link></div>;

  return (
    <form
      ref={formRef}
      className="card edit-form"
      action={action}
      method="post"
      onInput={(event) => persistDraft(draftKey, readDraft(event.currentTarget))}
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
          clearDraft(draftKey, true);
          setCompleted(true);
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
      {idempotencyFieldName && (
        <input type="hidden" name={idempotencyFieldName} value={idempotencyToken} readOnly />
      )}
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
          onClick={() => clearDraft(draftKey)}
        >
          Zrušit
        </Link>
        <button className="primary" type="submit" disabled={submitting || Boolean(idempotencyFieldName && !idempotencyToken)}>
          {submitting ? "Ukládám…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
