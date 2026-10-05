"use client";

import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import {X} from "lucide-react";

type PanelTab = {id: string; label: string; content: ReactNode};

/** Hash-addressable, focus-trapped native dialog. Forms return to the same panel after POST. */
export function PortalPanel({id, title, subtitle, aliases = [], tabs, children, feedback}: {
  id: string; title: string; subtitle?: string; aliases?: string[];
  tabs?: PanelTab[]; children?: ReactNode; feedback?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState(tabs?.[0]?.id || "");
  const tabPrefix = useId();
  const targetKeys = [id, ...aliases].join("|");
  const tabKeys = tabs?.map(tab => tab.id).join("|") || "";

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const targets = targetKeys.split("|");
    const tabIds = tabKeys ? tabKeys.split("|") : [];
    const matchesTarget = (hash: string) => targets.includes(hash) || tabIds.some(key => targets.some(target => hash === `${target}-${key}`));
    const captureOpener = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && matchesTarget(anchor.hash.slice(1))) opener.current = anchor;
    };
    const sync = () => {
      const hash = window.location.hash.slice(1);
      const suffix = tabIds.find(key => targets.some(target => hash === `${target}-${key}`));
      const matches = targets.includes(hash) || Boolean(suffix);
      if (matches) {
        setSelected(suffix || tabIds[0] || "");
        if (!node.open) {
          if (!opener.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          document.querySelectorAll<HTMLDialogElement>(".tenant-portal-v2 .tp-dialog[open]").forEach(other => {if (other !== node) other.close();});
          node.showModal();
          heading.current?.focus({preventScroll: true});
        }
      } else if (node.open) node.close();
    };
    sync();
    window.addEventListener("hashchange", sync);
    document.addEventListener("click", captureOpener, true);
    return () => {window.removeEventListener("hashchange", sync); document.removeEventListener("click", captureOpener, true);};
  }, [targetKeys, tabKeys]);

  function close() {
    dialog.current?.close();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    opener.current?.focus({preventScroll: true});
    opener.current = null;
  }

  return <dialog ref={dialog} id={id} className="tp-dialog" aria-labelledby={`${id}-title`}
    onCancel={event => {event.preventDefault(); close();}}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <header className="tp-dialog-header"><div><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className="tp-icon-button" aria-label="Zavřít" onClick={close}><X size={22}/></button></header>
    <div className="tp-dialog-body">{feedback}
      {tabs ? <><div className="tp-tabs" role="tablist" aria-label={title}>{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${tabPrefix}-${tab.id}-tab`} aria-controls={`${tabPrefix}-${tab.id}-panel`} aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onClick={() => setSelected(tab.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); setSelected(tabs[next].id);
        document.getElementById(`${tabPrefix}-${tabs[next].id}-tab`)?.focus();
      }}>{tab.label}</button>)}</div>{tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${tabPrefix}-${tab.id}-panel`} aria-labelledby={`${tabPrefix}-${tab.id}-tab`} hidden={selected !== tab.id}>{tab.content}</div>)}</> : children}
    </div>
  </dialog>;
}
