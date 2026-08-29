"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export const rowNavigationInteractiveSelector = "a,button,input,select,textarea,summary,details,form,label,[role='button'],[role='link'],[contenteditable='true']";

function hasInteractiveTarget(target: EventTarget | null, row: HTMLTableRowElement) {
  return target instanceof Element && target !== row && Boolean(target.closest(rowNavigationInteractiveSelector));
}

export function NavigableTableRow({ href, children, className = "", ariaLabel = "Otevřít detail" }: { href: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const router = useRouter();
  function open(modified: boolean) { if (modified) window.open(href, "_blank", "noopener,noreferrer"); else router.push(href); }
  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0 || hasInteractiveTarget(event.target, event.currentTarget)) return;
    open(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
  }
  function onAuxClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.button !== 1 || hasInteractiveTarget(event.target, event.currentTarget)) return;
    event.preventDefault(); open(true);
  }
  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault(); open(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
  }
  return <tr className={`navigable-table-row ${className}`.trim()} tabIndex={0} aria-label={ariaLabel} onClick={onClick} onAuxClick={onAuxClick} onKeyDown={onKeyDown}>{children}</tr>;
}
